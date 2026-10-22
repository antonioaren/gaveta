import './sqlite/warning.ts';
import { cp, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { expect, it } from 'vitest';
import {
  BACKLINK_COUNT,
  BACKLINKS,
  DUPLICATE_ID,
  GHOST_TITLE,
  NFR_SEED,
  NOTE_X,
  generateVault,
  generatedNotePath,
  linkerRel,
  linkerSpec,
  noteUlid,
  vaultPath,
  writeVault,
  type VaultName,
} from '@gaveta/fixtures';
import {
  BACKLINK_CONTEXT_LIMIT,
  GRAPH_DEPTH_MAX,
  GRAPH_DEPTH_MIN,
  GavetaError,
  backlinks,
  globalGraph,
  graphGhostKey,
  localGraph,
  openVaultIndex,
  outgoingLinks,
  type Graph,
  type GraphEdge,
  type GraphNode,
  type LocalGraphOptions,
  type VaultIndex,
} from './index.ts';

const SEED = 7;

function idAt(index: number): string {
  return noteUlid(SEED, index);
}

function escapeText(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function noteHtml(options: {
  readonly title: string;
  readonly id: string | null;
  readonly type?: string;
  readonly tags?: string;
  readonly aliases?: string;
  readonly body: string;
}): string {
  const head = ['<meta charset="utf-8">', `<title>${escapeText(options.title)}</title>`];
  if (options.id !== null) {
    head.push(`<meta name="gaveta:id" content="${escapeText(options.id)}">`);
  }
  head.push(`<meta name="gaveta:type" content="${options.type ?? 'doc'}">`);
  head.push('<meta name="gaveta:created" content="2026-10-22T10:00:00Z">');
  if (options.tags !== undefined) {
    head.push(`<meta name="gaveta:tags" content="${escapeText(options.tags)}">`);
  }
  if (options.aliases !== undefined) {
    head.push(`<meta name="gaveta:aliases" content="${escapeText(options.aliases)}">`);
  }
  return `<!doctype html><html lang="es"><head>${head.join('')}</head><body><article><h1>${escapeText(options.title)}</h1>${options.body}</article></body></html>`;
}

function anchor(targetId: string, title: string, rel: string): string {
  return `<p><a href="destino.html" data-g-to="${targetId}" rel="${rel}">${escapeText(title)}</a></p>`;
}

async function withTemp(run: (directory: string) => Promise<void>): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), 'gaveta-graph-'));
  try {
    await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function makeVault(parent: string): Promise<string> {
  const root = join(parent, 'vault');
  await mkdir(join(root, '.gaveta'), { recursive: true });
  return root;
}

async function writeNote(root: string, relativePath: string, html: string): Promise<void> {
  const absolute = join(root, ...relativePath.split('/'));
  await mkdir(dirname(absolute), { recursive: true });
  await writeFile(absolute, html);
}

async function indexed(root: string, run: (index: VaultIndex) => void): Promise<void> {
  const index = await openVaultIndex(root);
  try {
    await index.rebuild();
    run(index);
  } finally {
    index.close();
  }
}

async function withFixture(name: VaultName, run: (index: VaultIndex) => void): Promise<void> {
  await withTemp(async (parent) => {
    const root = join(parent, name);
    await cp(vaultPath(name), root, { recursive: true });
    await indexed(root, run);
  });
}

function thrown(run: () => void): GavetaError {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(GavetaError);
    if (error instanceof GavetaError) {
      return error;
    }
  }
  throw new Error('expected a GavetaError');
}

function compareEdge(left: GraphEdge, right: GraphEdge): number {
  if (left.source !== right.source) {
    return left.source < right.source ? -1 : 1;
  }
  if (left.target !== right.target) {
    return left.target < right.target ? -1 : 1;
  }
  if (left.rel === right.rel) {
    return 0;
  }
  if (left.rel === null) {
    return -1;
  }
  if (right.rel === null) {
    return 1;
  }
  return left.rel < right.rel ? -1 : 1;
}

function expectGraph(graph: Graph): void {
  const keys = new Set<string>();
  let previousKey = '';
  for (const node of graph.nodes) {
    expect(keys.has(node.key)).toBe(false);
    keys.add(node.key);
    expect(node.key >= previousKey).toBe(true);
    previousKey = node.key;
    expect(node.key.length).toBeGreaterThan(0);
    if (node.ghost) {
      expect(node).toMatchObject({ id: null, type: null, tags: [], path: null, ghost: true });
    } else {
      expect(node.path).toBe(node.key);
      expect(node.ghost).toBe(false);
    }
  }
  let previous: GraphEdge | null = null;
  const seen = new Set<string>();
  for (const edge of graph.edges) {
    expect(keys.has(edge.source)).toBe(true);
    expect(keys.has(edge.target)).toBe(true);
    const signature = `${edge.source}\u0000${edge.target}\u0000${edge.rel ?? '\u0001'}`;
    expect(seen.has(signature)).toBe(false);
    seen.add(signature);
    if (previous !== null) {
      expect(compareEdge(previous, edge)).toBeLessThanOrEqual(0);
    }
    previous = edge;
  }
}

function pathsOf(graph: Graph): string[] {
  const paths: string[] = [];
  for (const node of graph.nodes) {
    if (node.path !== null) {
      paths.push(node.path);
    }
  }
  return paths;
}

function nodeAt(graph: Graph, notePath: string): GraphNode {
  const node = graph.nodes.find((item) => item.path === notePath);
  if (node === undefined) {
    throw new Error(`missing graph node ${notePath}`);
  }
  return node;
}

function hasEdge(graph: Graph, source: string, target: string, rel: string | null): boolean {
  return graph.edges.some(
    (edge) => edge.source === source && edge.target === target && edge.rel === rel,
  );
}

it('returns an empty global graph for a vault with no notes', async () => {
  await withTemp(async (parent) => {
    const root = await makeVault(parent);
    await indexed(root, (index) => {
      const graph = globalGraph(index);
      expectGraph(graph);
      expect(graph).toEqual({ nodes: [], edges: [] });
      expect(globalGraph(index, {})).toEqual(graph);
      expect(globalGraph(index, { type: 'doc' })).toEqual(graph);
    });
  });
});

it('rejects a depth outside 1..3 and other invalid graph arguments', async () => {
  await withTemp(async (parent) => {
    const root = await makeVault(parent);
    await writeNote(root, 'a.html', noteHtml({ title: 'Alfa', id: idAt(0), body: '<p>Texto</p>' }));
    await indexed(root, (index) => {
      const badDepths: unknown[] = [0, 4, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, '2'];
      for (const depth of badDepths) {
        const error = thrown(() => {
          localGraph(index, 'a.html', { depth } as LocalGraphOptions);
        });
        expect(error.code).toBe('E_ARG_INVALID');
        expect(error.message).toBe('El argumento falta o está fuera de rango.');
      }
      expect(GRAPH_DEPTH_MIN).toBe(1);
      expect(GRAPH_DEPTH_MAX).toBe(3);
      expect(BACKLINK_CONTEXT_LIMIT).toBe(200);

      const badGlobals: unknown[] = [
        null,
        [],
        { depth: 1 },
        { type: 'DOC' },
        { type: 1 },
        { extra: true },
      ];
      for (const filters of badGlobals) {
        expect(thrown(() => globalGraph(index, filters as never)).code).toBe('E_ARG_INVALID');
      }
      const badLocals: unknown[] = [
        {},
        null,
        [],
        { depth: 1, ref: 'a.html' },
        { depth: 1, tag: '' },
        { depth: 1, rel: '' },
        { depth: 1, folder: '' },
        { depth: 1, folder: 'a/./b' },
        { depth: 1, folder: 'a//b' },
        { depth: 1, tag: 'ok\0no' },
      ];
      for (const options of badLocals) {
        expect(thrown(() => localGraph(index, 'a.html', options as never)).code).toBe(
          'E_ARG_INVALID',
        );
      }
      for (const folder of ['..', '/etc', 'a/../b', 'a\\b', 'C:/windows', '/']) {
        expect(thrown(() => localGraph(index, 'a.html', { depth: 1, folder })).code).toBe(
          'E_PATH_OUTSIDE_VAULT',
        );
      }
      expect(thrown(() => localGraph(index, '', { depth: 1 })).code).toBe('E_ARG_INVALID');
      expect(thrown(() => localGraph(index, 'a.html\0', { depth: 1 })).code).toBe('E_ARG_INVALID');
      expect(thrown(() => localGraph(index, 1 as never, { depth: 1 })).code).toBe('E_ARG_INVALID');
      expect(thrown(() => outgoingLinks(index, '')).code).toBe('E_ARG_INVALID');
      expect(thrown(() => backlinks(index, '')).code).toBe('E_ARG_INVALID');
      expect(thrown(() => localGraph(index, 'no-existe.html', { depth: 1 })).code).toBe(
        'E_REF_NOT_FOUND',
      );
    });
  });
});

it('walks local depth 1, 2, and 3 in both directions and stops at the bound', async () => {
  await withTemp(async (parent) => {
    const root = await makeVault(parent);
    const names = ['a', 'b', 'c', 'd', 'e', 'f'] as const;
    for (let index = 0; index < names.length; index += 1) {
      const name = names[index];
      if (name === undefined) {
        continue;
      }
      const next = names[index + 1];
      const body =
        next === undefined ? '<p>Fin</p>' : anchor(idAt(index + 1), next.toUpperCase(), 'related');
      await writeNote(
        root,
        `${name}.html`,
        noteHtml({ title: name.toUpperCase(), id: idAt(index), body }),
      );
    }
    await indexed(root, (index) => {
      const depth1 = localGraph(index, 'a.html', { depth: 1 });
      const depth2 = localGraph(index, 'a.html', { depth: 2 });
      const depth3 = localGraph(index, 'a.html', { depth: 3 });
      expectGraph(depth1);
      expectGraph(depth2);
      expectGraph(depth3);
      expect(pathsOf(depth1)).toEqual(['a.html', 'b.html']);
      expect(pathsOf(depth2)).toEqual(['a.html', 'b.html', 'c.html']);
      expect(pathsOf(depth3)).toEqual(['a.html', 'b.html', 'c.html', 'd.html']);
      expect(pathsOf(depth3)).not.toContain('e.html');
      expect(pathsOf(depth3)).not.toContain('f.html');
      expect(hasEdge(depth1, 'a.html', 'b.html', 'related')).toBe(true);
      expect(hasEdge(depth1, 'b.html', 'c.html', 'related')).toBe(false);

      const aroundD = localGraph(index, 'd.html', { depth: 1 });
      expect(pathsOf(aroundD)).toEqual(['c.html', 'd.html', 'e.html']);
      const wider = localGraph(index, 'd.html', { depth: 2 });
      expect(pathsOf(wider)).toEqual(['b.html', 'c.html', 'd.html', 'e.html', 'f.html']);
      expect(pathsOf(wider)).not.toContain('a.html');
      expect(pathsOf(localGraph(index, 'd.html', { depth: 3 }))).toEqual(
        names.map((name) => `${name}.html`),
      );
    });
  });
});

it('keeps each node once when the neighborhood has a cycle', async () => {
  await withTemp(async (parent) => {
    const root = await makeVault(parent);
    const count = 8;
    for (let index = 0; index < count; index += 1) {
      const next = (index + 1) % count;
      await writeNote(
        root,
        `c${String(index)}.html`,
        noteHtml({
          title: `Ciclo ${String(index)}`,
          id: idAt(index),
          body: anchor(idAt(next), `Ciclo ${String(next)}`, 'related'),
        }),
      );
    }
    await indexed(root, (index) => {
      const depth1 = localGraph(index, 'c0.html', { depth: 1 });
      const depth3 = localGraph(index, 'c0.html', { depth: 3 });
      expectGraph(depth1);
      expectGraph(depth3);
      expect(pathsOf(depth1)).toEqual(['c0.html', 'c1.html', 'c7.html']);
      expect(pathsOf(depth3)).toEqual([
        'c0.html',
        'c1.html',
        'c2.html',
        'c3.html',
        'c5.html',
        'c6.html',
        'c7.html',
      ]);
      expect(pathsOf(depth3)).not.toContain('c4.html');
      expect(depth3.nodes).toHaveLength(7);
      expect(depth3.edges).toHaveLength(6);
      expect(localGraph(index, 'c0.html', { depth: 3 }).nodes).toHaveLength(7);
    });
  });
});

it('dedupes repeated edges, keeps a self-loop, and omits broken targets', async () => {
  await withTemp(async (parent) => {
    const root = await makeVault(parent);
    const missing = idAt(9);
    await writeNote(
      root,
      'loop.html',
      noteHtml({
        title: 'Bucle',
        id: idAt(0),
        body: anchor(idAt(0), 'Bucle', 'related'),
      }),
    );
    await writeNote(
      root,
      'origen.html',
      noteHtml({
        title: 'Origen',
        id: idAt(1),
        body: [
          anchor(idAt(2), 'Destino', 'related'),
          anchor(idAt(2), 'Destino', 'related'),
          anchor(idAt(2), 'Destino', 'references'),
          `<p><a href="no.html" data-g-to="${missing}" rel="related">Roto</a></p>`,
        ].join(''),
      }),
    );
    await writeNote(
      root,
      'destino.html',
      noteHtml({ title: 'Destino', id: idAt(2), body: '<p>Fin</p>' }),
    );
    await writeNote(
      root,
      'sin-id.html',
      noteHtml({
        title: 'Sin id',
        id: null,
        body: '<p><a data-g-pending="Fantasma">Fantasma</a></p>',
      }),
    );
    await indexed(root, (index) => {
      const graph = globalGraph(index);
      expectGraph(graph);
      expect(hasEdge(graph, 'loop.html', 'loop.html', 'related')).toBe(true);
      expect(localGraph(index, 'loop.html', { depth: 1 }).nodes).toHaveLength(1);
      expect(
        graph.edges.filter(
          (edge) => edge.source === 'origen.html' && edge.target === 'destino.html',
        ),
      ).toEqual([
        { source: 'origen.html', target: 'destino.html', rel: 'references' },
        { source: 'origen.html', target: 'destino.html', rel: 'related' },
      ]);
      expect(graph.edges.some((edge) => edge.target === missing || edge.source === 'no.html')).toBe(
        false,
      );
      expect(graph.nodes.some((node) => node.ghost && node.title === 'Fantasma')).toBe(true);
      expect(outgoingLinks(index, 'origen.html')).toHaveLength(4);
      const broken = outgoingLinks(index, 'origen.html')[3];
      expect(broken).toMatchObject({
        text: 'Roto',
        rel: 'related',
        kind: 'canonical',
        target: { id: missing, path: null, ghost: false, title: 'Roto' },
      });
      expect(backlinks(index, 'sin-id.html')).toEqual([]);
      expect(outgoingLinks(index, 'sin-id.html')[0]).toMatchObject({
        kind: 'pending',
        target: { id: null, path: null, title: 'Fantasma', ghost: true },
      });
    });
  });
});

it('filters by type, tag, folder, and rel, including combined filters', async () => {
  await withTemp(async (parent) => {
    const root = await makeVault(parent);
    await writeNote(
      root,
      'docs/a.html',
      noteHtml({
        title: 'Alfa',
        id: idAt(0),
        tags: 'alpha',
        body: [
          anchor(idAt(1), 'Beta', 'related'),
          anchor(idAt(2), 'Gamma', 'depends-on'),
          '<p><a data-g-pending="Fantasma" rel="depends-on">Fantasma</a></p>',
        ].join(''),
      }),
    );
    await writeNote(
      root,
      'docs/b.html',
      noteHtml({
        title: 'Beta',
        id: idAt(1),
        tags: 'beta',
        body: anchor(idAt(2), 'Gamma', 'related'),
      }),
    );
    await writeNote(
      root,
      'other/c.html',
      noteHtml({
        title: 'Gamma',
        id: idAt(2),
        type: 'slides',
        tags: 'alpha',
        body: '<p>Diapositiva</p>',
      }),
    );
    await writeNote(
      root,
      'other/d.html',
      noteHtml({ title: 'Delta', id: idAt(3), tags: 'alpha', body: '<p>Suelta</p>' }),
    );
    await writeNote(
      root,
      'enlaces.html',
      noteHtml({ title: 'Archivo', id: idAt(4), tags: 'alpha', body: '<p>No es carpeta</p>' }),
    );
    await indexed(root, (index) => {
      const ghost = graphGhostKey('Fantasma');
      const folder = globalGraph(index, { folder: 'docs' });
      expectGraph(folder);
      expect(pathsOf(folder)).toEqual(['docs/a.html', 'docs/b.html']);
      expect(hasEdge(folder, 'docs/a.html', 'docs/b.html', 'related')).toBe(true);
      expect(hasEdge(folder, 'docs/a.html', ghost, 'depends-on')).toBe(true);
      expect(hasEdge(folder, 'docs/a.html', 'other/c.html', 'depends-on')).toBe(false);
      expect(pathsOf(globalGraph(index, { folder: 'docs/' }))).toEqual(pathsOf(folder));
      expect(pathsOf(globalGraph(index, { folder: 'enlaces' }))).toEqual([]);

      const docsOnly = globalGraph(index, { type: 'doc' });
      expect(pathsOf(docsOnly)).toEqual([
        'docs/a.html',
        'docs/b.html',
        'enlaces.html',
        'other/d.html',
      ]);
      expect(docsOnly.nodes.some((node) => node.key === ghost)).toBe(true);
      expect(hasEdge(docsOnly, 'docs/a.html', 'other/c.html', 'depends-on')).toBe(false);

      const slides = globalGraph(index, { type: 'slides' });
      expect(pathsOf(slides)).toEqual(['other/c.html']);
      expect(slides.edges).toEqual([]);

      const alpha = globalGraph(index, { tag: 'alpha' });
      expect(pathsOf(alpha)).toEqual([
        'docs/a.html',
        'enlaces.html',
        'other/c.html',
        'other/d.html',
      ]);
      expect(hasEdge(alpha, 'docs/a.html', 'other/c.html', 'depends-on')).toBe(true);
      expect(hasEdge(alpha, 'docs/a.html', 'docs/b.html', 'related')).toBe(false);
      expect(alpha.nodes.some((node) => node.key === ghost)).toBe(true);

      const depends = globalGraph(index, { rel: 'depends-on' });
      expect(pathsOf(depends)).toEqual([
        'docs/a.html',
        'docs/b.html',
        'enlaces.html',
        'other/c.html',
        'other/d.html',
      ]);
      expect(depends.edges.every((edge) => edge.rel === 'depends-on')).toBe(true);
      expect(hasEdge(depends, 'docs/a.html', 'other/c.html', 'depends-on')).toBe(true);
      expect(hasEdge(depends, 'docs/a.html', ghost, 'depends-on')).toBe(true);
      expect(hasEdge(depends, 'docs/a.html', 'docs/b.html', 'related')).toBe(false);

      const combined = globalGraph(index, {
        type: 'doc',
        tag: 'alpha',
        folder: 'docs',
        rel: 'depends-on',
      });
      expect(pathsOf(combined)).toEqual(['docs/a.html']);
      expect(combined.edges).toEqual([{ source: 'docs/a.html', target: ghost, rel: 'depends-on' }]);

      const related = globalGraph(index, {
        type: 'doc',
        tag: 'alpha',
        folder: 'docs',
        rel: 'related',
      });
      expect(pathsOf(related)).toEqual(['docs/a.html']);
      expect(related.edges).toEqual([]);

      const around = localGraph(index, 'docs/a.html', { depth: 1 });
      expect(pathsOf(around)).toEqual(['docs/a.html', 'docs/b.html', 'other/c.html']);
      expect(around.nodes.some((node) => node.key === ghost)).toBe(true);
      expect(hasEdge(around, 'docs/b.html', 'other/c.html', 'related')).toBe(true);
      expect(pathsOf(around)).not.toContain('other/d.html');

      const slidesNear = localGraph(index, 'docs/a.html', { depth: 1, type: 'slides' });
      expect(pathsOf(slidesNear)).toEqual(['docs/a.html', 'other/c.html']);
      expect(slidesNear.nodes.some((node) => node.key === ghost)).toBe(true);
      expect(pathsOf(slidesNear)).not.toContain('docs/b.html');

      const docsNear = localGraph(index, 'docs/a.html', { depth: 2, type: 'doc' });
      expect(pathsOf(docsNear)).toEqual(['docs/a.html', 'docs/b.html']);
      expect(docsNear.nodes.some((node) => node.key === ghost)).toBe(true);
      expect(pathsOf(docsNear)).not.toContain('other/c.html');

      const byRel = localGraph(index, 'docs/a.html', { depth: 1, rel: 'depends-on' });
      expect(pathsOf(byRel)).toEqual(['docs/a.html', 'other/c.html']);
      expect(byRel.edges.every((edge) => edge.rel === 'depends-on')).toBe(true);

      const inOther = localGraph(index, 'docs/a.html', { depth: 1, folder: 'other' });
      expect(pathsOf(inOther)).toEqual(['docs/a.html', 'other/c.html']);
      expect(inOther.nodes.some((node) => node.key === ghost)).toBe(true);

      expect(pathsOf(localGraph(index, 'other/d.html', { depth: 3 }))).toEqual(['other/d.html']);
      expect(pathsOf(localGraph(index, 'other/c.html', { depth: 1, type: 'slides' }))).toEqual([
        'other/c.html',
      ]);
    });
  });
});

it('resolves a ref by path, id, title, or alias and reports ambiguity', async () => {
  await withTemp(async (parent) => {
    const root = await makeVault(parent);
    await writeNote(
      root,
      'otro.html',
      noteHtml({
        title: 'Índice',
        id: idAt(0),
        aliases: 'indice',
        body: anchor(idAt(1), 'Real', 'related'),
      }),
    );
    await writeNote(
      root,
      'real.html',
      noteHtml({
        title: 'otro.html',
        id: idAt(1),
        body: anchor(idAt(5), 'Extra', 'related'),
      }),
    );
    await writeNote(
      root,
      'extra.html',
      noteHtml({ title: 'Extra', id: idAt(5), body: '<p>Solo desde la ruta</p>' }),
    );
    await writeNote(
      root,
      'uno.html',
      noteHtml({ title: 'Igual', id: idAt(2), body: '<p>Uno</p>' }),
    );
    await writeNote(
      root,
      'dos.html',
      noteHtml({ title: 'Igual', id: idAt(3), aliases: 'Compartido', body: '<p>Dos</p>' }),
    );
    await writeNote(
      root,
      'tres.html',
      noteHtml({ title: 'Compartido', id: idAt(6), body: '<p>Tres</p>' }),
    );
    await writeNote(
      root,
      'dup/alfa.html',
      noteHtml({
        title: 'Alfa',
        id: DUPLICATE_ID,
        body: anchor(idAt(1), 'Real', 'related'),
      }),
    );
    await writeNote(
      root,
      'dup/beta.html',
      noteHtml({ title: 'Beta', id: DUPLICATE_ID, body: '<p>Beta</p>' }),
    );
    await writeNote(
      root,
      'apunta.html',
      noteHtml({
        title: 'Apunta',
        id: idAt(4),
        body: `<p><a href="x.html" data-g-to="${DUPLICATE_ID}" rel="related">Duplicado</a></p>`,
      }),
    );
    await indexed(root, (index) => {
      expect(pathsOf(localGraph(index, 'otro.html', { depth: 1 }))).toEqual([
        'otro.html',
        'real.html',
      ]);
      expect(pathsOf(localGraph(index, 'otro.html', { depth: 1 }))).not.toContain('extra.html');
      expect(nodeAt(localGraph(index, idAt(0), { depth: 1 }), 'otro.html').title).toBe('Índice');
      expect(nodeAt(localGraph(index, 'INDICE', { depth: 1 }), 'otro.html').path).toBe('otro.html');
      expect(nodeAt(localGraph(index, 'Índice', { depth: 1 }), 'otro.html').id).toBe(idAt(0));
      expect(thrown(() => localGraph(index, 'igual', { depth: 1 })).code).toBe('E_REF_AMBIGUOUS');
      expect(thrown(() => localGraph(index, 'Compartido', { depth: 1 })).code).toBe(
        'E_REF_AMBIGUOUS',
      );
      expect(thrown(() => localGraph(index, DUPLICATE_ID, { depth: 1 })).code).toBe(
        'E_REF_AMBIGUOUS',
      );
      expect(nodeAt(localGraph(index, 'dup/alfa.html', { depth: 1 }), 'dup/alfa.html').title).toBe(
        'Alfa',
      );
      expect(thrown(() => outgoingLinks(index, idAt(0).toLowerCase())).code).toBe(
        'E_REF_NOT_FOUND',
      );

      const graph = globalGraph(index);
      expect(hasEdge(graph, 'apunta.html', 'dup/alfa.html', 'related')).toBe(true);
      expect(hasEdge(graph, 'apunta.html', 'dup/beta.html', 'related')).toBe(true);
      expect(outgoingLinks(index, 'apunta.html')[0]?.target).toMatchObject({
        id: DUPLICATE_ID,
        path: null,
        ghost: false,
        title: 'Duplicado',
      });
      expect(backlinks(index, 'dup/alfa.html').map((link) => link.sourcePath)).toEqual([
        'apunta.html',
      ]);
      expect(backlinks(index, 'dup/beta.html').map((link) => link.sourcePath)).toEqual([
        'apunta.html',
      ]);
    });
  });
});

it('builds backlink context of at most 200 characters around each link', async () => {
  await withTemp(async (parent) => {
    const root = await makeVault(parent);
    const fillerA = 'a'.repeat(180);
    const fillerB = 'b'.repeat(180);
    const far = 'x'.repeat(400);
    const longText = 'L'.repeat(250);
    await writeNote(
      root,
      'medio.html',
      noteHtml({ title: 'Medio', id: idAt(1), body: '<p>Destino</p>' }),
    );
    await writeNote(
      root,
      'frase.html',
      noteHtml({
        title: 'Frase',
        id: idAt(0),
        body: `<section id="frase"><h2>Frase</h2><p>${fillerA} START <a href="medio.html" data-g-to="${idAt(1)}" rel="related">Medio</a> END ${fillerB}</p></section>`,
      }),
    );
    await writeNote(
      root,
      'lejos.html',
      noteHtml({
        title: 'Lejos',
        id: idAt(2),
        body: [
          `<section id="lejos"><p>${far} IZQ <a href="medio.html" data-g-to="${idAt(1)}" rel="related">Medio</a> finuno</p>`,
          `<p>inidos ${far} DER <a href="medio.html" data-g-to="${idAt(1)}" rel="references">Medio</a> findos</p></section>`,
        ].join(''),
      }),
    );
    await writeNote(
      root,
      'largo.html',
      noteHtml({
        title: 'Largo',
        id: idAt(3),
        body: `<section id="largo"><h2>Titulo</h2><p><a href="medio.html" data-g-to="${idAt(1)}" rel="related">${longText}</a></p></section>`,
      }),
    );
    await indexed(root, (index) => {
      const incoming = backlinks(index, 'medio.html');
      expect(incoming.map((link) => link.sourcePath)).toEqual([
        'frase.html',
        'largo.html',
        'lejos.html',
        'lejos.html',
      ]);
      for (const link of incoming) {
        expect(link.context.length).toBeLessThanOrEqual(BACKLINK_CONTEXT_LIMIT);
      }
      const phrase = incoming[0];
      if (phrase === undefined) {
        throw new Error('missing phrase backlink');
      }
      expect(phrase.context).toContain('Medio');
      expect(phrase.context).toContain('START');
      expect(phrase.context).toContain('END');
      expect(phrase.context).not.toContain('Frase');
      expect(phrase.context.startsWith(fillerA)).toBe(false);
      expect(phrase.sectionId).toBe('frase');
      expect(phrase.rel).toBe('related');
      expect(phrase.text).toBe('Medio');
      expect(phrase.sourceTitle).toBe('Frase');
      expect(phrase.sourceId).toBe(idAt(0));

      const distant = incoming.filter((link) => link.sourcePath === 'lejos.html');
      expect(distant[0]?.context).toContain('IZQ');
      expect(distant[0]?.context).not.toContain('DER');
      expect(distant[1]?.context).toContain('DER');
      expect(distant[1]?.context).not.toContain('IZQ');
      expect(distant[0]?.rel).toBe('related');
      expect(distant[1]?.rel).toBe('references');

      const clipped = incoming.find((link) => link.sourcePath === 'largo.html');
      expect(clipped?.context).toBe(longText.slice(0, BACKLINK_CONTEXT_LIMIT));
      expect(clipped?.context).not.toContain(longText);
    });
  });
});

it('builds the backlinks fixture graph, ghosts, and backlink phrases', async () => {
  await withFixture('backlinks', (index) => {
    const graph = globalGraph(index);
    expectGraph(graph);
    expect(globalGraph(index)).toEqual(graph);
    const ghost = graphGhostKey(GHOST_TITLE);
    const expectedEdges: GraphEdge[] = [];
    for (let indexNote = 1; indexNote <= BACKLINK_COUNT; indexNote += 1) {
      expectedEdges.push({
        source: linkerSpec(indexNote).path,
        target: NOTE_X.path,
        rel: linkerRel(indexNote),
      });
    }
    expectedEdges.push(
      { source: 'formas-de-enlace.html', target: 'destino-enlace.html', rel: 'related' },
      { source: 'formas-de-enlace.html', target: ghost, rel: null },
    );
    expectedEdges.sort(compareEdge);
    expect(graph.edges).toEqual(expectedEdges);
    expect(graph.edges.filter((edge) => edge.target === 'destino-enlace.html')).toHaveLength(1);
    expect(pathsOf(graph)).toEqual([...BACKLINKS.map((spec) => spec.path)].sort(compareText));
    expect(graph.nodes.find((node) => node.ghost)).toEqual({
      key: ghost,
      id: null,
      title: GHOST_TITLE,
      type: null,
      tags: [],
      path: null,
      ghost: true,
    });
    expect(nodeAt(graph, NOTE_X.path)).toMatchObject({
      key: NOTE_X.path,
      id: NOTE_X.id,
      title: NOTE_X.title,
      type: 'doc',
      tags: ['fixture', 'backlinks'],
      path: NOTE_X.path,
      ghost: false,
    });

    const slides = globalGraph(index, { type: 'slides' });
    expect(pathsOf(slides)).toEqual(['enlaces/mas/enlace-19.html']);
    expect(slides.edges).toEqual([]);
    expect(pathsOf(globalGraph(index, { type: 'todo' }))).toEqual(['enlaces/mas/enlace-20.html']);

    const byTag = globalGraph(index, { tag: 'backlink' });
    expect(byTag.edges).toEqual([]);
    expect(pathsOf(byTag)).toHaveLength(BACKLINK_COUNT);
    const fixtureTag = globalGraph(index, { tag: 'fixture' });
    expect(fixtureTag.nodes.map((node) => node.key)).toEqual([
      'destino-enlace.html',
      'formas-de-enlace.html',
      ghost,
      NOTE_X.path,
    ]);

    const depends = globalGraph(index, { rel: 'depends-on' });
    expect(depends.edges).toHaveLength(4);
    expect(depends.edges.every((edge) => edge.rel === 'depends-on')).toBe(true);
    expect(depends.nodes.some((node) => node.ghost)).toBe(false);
    expect(depends.edges.map((edge) => edge.source).sort(compareText)).toEqual(
      [2, 7, 12, 17].map((item) => linkerSpec(item).path).sort(compareText),
    );

    expect(pathsOf(globalGraph(index, { folder: 'enlaces' }))).toHaveLength(BACKLINK_COUNT);
    expect(pathsOf(globalGraph(index, { folder: 'enlaces/mas' }))).toHaveLength(10);
    expect(pathsOf(globalGraph(index, { folder: 'enlaces/' }))).toEqual(
      pathsOf(globalGraph(index, { folder: 'enlaces' })),
    );

    const combined = globalGraph(index, {
      type: 'doc',
      tag: 'backlink',
      folder: 'enlaces/mas',
      rel: 'depends-on',
    });
    expect(combined.edges).toEqual([]);
    expect(pathsOf(combined)).toEqual([
      'enlaces/mas/enlace-11.html',
      'enlaces/mas/enlace-12.html',
      'enlaces/mas/enlace-13.html',
      'enlaces/mas/enlace-14.html',
      'enlaces/mas/enlace-15.html',
      'enlaces/mas/enlace-16.html',
      'enlaces/mas/enlace-17.html',
      'enlaces/mas/enlace-18.html',
    ]);

    const local = localGraph(index, 'nota equis', { depth: 1 });
    expectGraph(local);
    expect(pathsOf(local)).toEqual(
      [NOTE_X.path, ...Array.from({ length: 20 }, (_, item) => linkerSpec(item + 1).path)].sort(
        compareText,
      ),
    );
    expect(pathsOf(local)).not.toContain('formas-de-enlace.html');
    expect(pathsOf(local)).not.toContain('destino-enlace.html');
    expect(local.nodes.some((node) => node.ghost)).toBe(false);
    expect(pathsOf(localGraph(index, NOTE_X.id, { depth: 3 }))).toEqual(pathsOf(local));
    expect(pathsOf(localGraph(index, NOTE_X.path, { depth: 2 }))).toEqual(pathsOf(local));

    const aroundForms = localGraph(index, 'Formas de enlace', { depth: 1 });
    expect(pathsOf(aroundForms)).toEqual(['destino-enlace.html', 'formas-de-enlace.html']);
    expect(aroundForms.nodes.some((node) => node.key === ghost)).toBe(true);
    expect(pathsOf(aroundForms)).not.toContain(NOTE_X.path);

    const incoming = backlinks(index, NOTE_X.title);
    expect(incoming).toHaveLength(BACKLINK_COUNT);
    expect(outgoingLinks(index, NOTE_X.path)).toEqual([]);
    for (let item = 0; item < incoming.length; item += 1) {
      const link = incoming[item];
      const spec = linkerSpec(item + 1);
      if (link === undefined) {
        throw new Error('missing backlink');
      }
      expect(link.sourcePath).toBe(spec.path);
      expect(link.sourceId).toBe(spec.id);
      expect(link.sourceTitle).toBe(spec.title);
      expect(link.rel).toBe(linkerRel(item + 1));
      expect(link.text).toBe('Nota X');
      expect(link.context.length).toBeLessThanOrEqual(BACKLINK_CONTEXT_LIMIT);
      expect(link.context).toContain('Nota X');
      expect(link.href).toBe(item < 10 ? '../nota-x.html' : '../../nota-x.html');
      expect(link.sectionId).toBe(item === 19 ? null : 'enlace');
    }
    expect(incoming[0]?.context).toContain('El enlace 01 apunta a');
    expect(incoming[18]?.context).toContain('La diapositiva apunta a');
    expect(incoming[19]?.context).toContain('Revisar');

    const forms = outgoingLinks(index, 'formas-de-enlace.html');
    expect(forms.map((link) => link.kind)).toEqual([
      'canonical',
      'wikilink',
      'wikilink',
      'wikilink',
      'pending',
    ]);
    expect(forms.map((link) => link.text)).toEqual([
      'Destino enlace',
      'Destino enlace',
      'texto visible',
      'Destino enlace',
      'Nota fantasma',
    ]);
    expect(forms[0]?.target).toEqual({
      id: '01M5HGV8800000000000000002',
      path: 'destino-enlace.html',
      title: 'Destino enlace',
      ghost: false,
    });
    expect(forms[0]?.rel).toBe('related');
    expect(forms[0]?.sectionId).toBe('atajos');
    expect(forms[0]?.href).toBe('destino-enlace.html');
    expect(forms[4]?.target.ghost).toBe(true);
    expect(forms[4]?.target.title).toBe(GHOST_TITLE);
    expect(forms[1]?.target).toMatchObject({ path: null, ghost: false, title: 'Destino enlace' });
    expect(backlinks(index, 'destino-enlace.html')).toHaveLength(1);
    expect(backlinks(index, 'Destino enlace')[0]).toMatchObject({
      sourcePath: 'formas-de-enlace.html',
      rel: 'related',
      sectionId: 'atajos',
      text: 'Destino enlace',
    });
  });
});

it('graphs the problems vault from ids, including the ghost and not the broken link', async () => {
  await withFixture('problems', (index) => {
    const graph = globalGraph(index);
    expectGraph(graph);
    const ghost = graphGhostKey(GHOST_TITLE);
    expect(graph.nodes.find((node) => node.ghost)?.key).toBe(ghost);
    expect(hasEdge(graph, 'nota-pendiente.html', ghost, null)).toBe(true);
    expect(graph.edges.some((edge) => edge.source === 'nota-rota.html')).toBe(false);
    expect(graph.nodes.some((node) => node.id === '01M5HGV88000000000000000ZZ')).toBe(false);
    for (const source of [
      'anidada/ruta-del-tema.html',
      'dup/duplicado-alfa.html',
      'dup/duplicado-beta.html',
      'href-desfasado.html',
      'nota-invalida.html',
      'nota-sana.html',
    ]) {
      expect(hasEdge(graph, source, 'nota-destino.html', 'related')).toBe(true);
    }
    expect(backlinks(index, 'nota huerfana')).toEqual([]);
    expect(
      nodeAt(localGraph(index, 'nota huerfana', { depth: 1 }), 'nota-huerfana.html').title,
    ).toBe('Nota huérfana');
    const destino = backlinks(index, 'nota-destino.html');
    expect(destino.map((link) => link.sourcePath)).toEqual([
      'anidada/ruta-del-tema.html',
      'dup/duplicado-alfa.html',
      'dup/duplicado-beta.html',
      'href-desfasado.html',
      'nota-invalida.html',
      'nota-sana.html',
    ]);
    expect(destino.every((link) => link.context.includes('Nota destino'))).toBe(true);
    expect(destino.every((link) => link.context.length <= BACKLINK_CONTEXT_LIMIT)).toBe(true);
    const stale = outgoingLinks(index, 'href-desfasado.html')[0];
    expect(stale?.href).toBe('ruta-incorrecta.html');
    expect(stale?.target.path).toBe('nota-destino.html');
    expect(pathsOf(globalGraph(index, { folder: 'dup' }))).toEqual([
      'dup/duplicado-alfa.html',
      'dup/duplicado-beta.html',
    ]);
  });
});

it('queries the seeded 1000-note vault without walking the whole ring', async () => {
  await withTemp(async (parent) => {
    const root = join(parent, 'nfr');
    writeVault(root, generateVault({ noteCount: 1000, seed: NFR_SEED }));
    await indexed(root, (index) => {
      const center = generatedNotePath(0);
      const started = performance.now();
      const graph = globalGraph(index);
      const depth1 = localGraph(index, center, { depth: 1 });
      const depth3 = localGraph(index, center, { depth: 3 });
      const incoming = backlinks(index, generatedNotePath(1));
      const outgoing = outgoingLinks(index, center);
      const elapsed = performance.now() - started;
      expectGraph(graph);
      expectGraph(depth1);
      expectGraph(depth3);
      expect(graph.nodes).toHaveLength(1000);
      expect(graph.edges).toHaveLength(2000);
      expect(graph.nodes.some((node) => node.ghost)).toBe(false);
      expect(pathsOf(depth1).sort(compareText)).toEqual(
        [0, 1, 10, 990, 999].map((item) => generatedNotePath(item)).sort(compareText),
      );
      expect(pathsOf(depth3)).toContain(generatedNotePath(30));
      expect(pathsOf(depth3)).not.toContain(generatedNotePath(40));
      expect(depth3.nodes.length).toBeLessThan(100);
      expect(outgoing.map((link) => link.target.path)).toEqual([
        generatedNotePath(1),
        generatedNotePath(10),
      ]);
      expect(outgoing.map((link) => link.rel)).toEqual(['related', 'references']);
      expect(incoming).toHaveLength(2);
      expect(incoming.every((link) => link.context.includes('Nota 0001'))).toBe(true);
      expect(incoming.every((link) => link.context.length <= BACKLINK_CONTEXT_LIMIT)).toBe(true);
      expect(elapsed).toBeLessThan(3000);
    });
  });
}, 30_000);

function compareText(left: string, right: string): number {
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
}
