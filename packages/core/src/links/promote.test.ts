import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  GavetaError,
  globalGraph,
  parseNote,
  promotePendingAnchors,
  promotePendingLinks,
  validateNote,
  type VaultIndex,
} from '../index.ts';
import { openVaultIndex } from '../sqlite/store.ts';

const SOURCE_ID = '01JB7Z3K9QX4T5M2N8V6R0WYHC';
const OTHER_ID = '01JB8A2M4R7C9D1E3F5G7H9J0K';
const CREATED_ID = '01JB9C3N5S8D0E2F4G6H8J1K2M';
const NESTED_ID = '01JB0D4P6T9E1F3G5H7J9K2M3N';

function noteHtml(options: {
  readonly title: string;
  readonly id?: string;
  readonly body?: string;
  readonly aliases?: string;
}): string {
  const head = [
    '<meta charset="utf-8">',
    `<title>${options.title}</title>`,
    `<meta name="gaveta:id" content="${options.id ?? SOURCE_ID}">`,
    '<meta name="gaveta:type" content="doc">',
    '<meta name="gaveta:created" content="2026-10-22T10:00:00Z">',
  ];
  if (options.aliases !== undefined) {
    head.push(`<meta name="gaveta:aliases" content="${options.aliases}">`);
  }
  const body = options.body ?? 'Cuerpo';
  return `<!doctype html><html lang="es"><head>${head.join('')}</head><body><article><h1>${options.title}</h1><p>${body}</p></article></body></html>`;
}

const CREATED = {
  id: CREATED_ID,
  path: 'docs/roadmap.html',
  title: 'Roadmap',
  aliases: ['Plan', 'Hoja de ruta'],
} as const;

async function withTemp(run: (directory: string) => Promise<void>): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), 'gaveta-promote-'));
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

async function withIndex(root: string, run: (index: VaultIndex) => Promise<void>): Promise<void> {
  const index = await openVaultIndex(root);
  try {
    await index.rebuild();
    await run(index);
  } finally {
    index.close();
  }
}

describe('promotePendingAnchors', () => {
  it('rewrites a pending anchor that matches the new title, ignoring case and accents', () => {
    const html =
      '<p><a data-g-pending="índice">ver</a></p><p><a data-g-pending="Otra">Otra</a></p>';
    const result = promotePendingAnchors({
      html,
      fromPath: 'notas/origen.html',
      note: { id: CREATED_ID, path: 'docs/indice.html', title: 'Índice' },
    });
    expect(result.html).toBe(
      `<p><a href="../docs/indice.html" data-g-to="${CREATED_ID}">ver</a></p><p><a data-g-pending="Otra">Otra</a></p>`,
    );
    expect(result.anchors).toEqual([
      {
        pendingTitle: 'índice',
        href: '../docs/indice.html',
        text: 'ver',
        matchedBy: 'title',
      },
    ]);
    const parsed = parseNote(result.html);
    expect(parsed.note?.links.map((link) => link.kind)).toEqual(['canonical', 'pending']);
  });

  it('matches an alias, keeps the visible label and rel, and does not retitle the anchor', () => {
    const html = '<p>Antes <a rel="related" data-g-pending="PLAN">el plan</a> después.</p>';
    const result = promotePendingAnchors({
      html,
      fromPath: 'docs/otra.html',
      note: CREATED,
    });
    expect(result.html).toBe(
      `<p>Antes <a rel="related" href="roadmap.html" data-g-to="${CREATED_ID}">el plan</a> después.</p>`,
    );
    expect(result.anchors).toEqual([
      {
        pendingTitle: 'PLAN',
        href: 'roadmap.html',
        text: 'el plan',
        matchedBy: 'alias',
      },
    ]);
  });

  it('promotes every matching anchor and leaves wikilinks, canonical links, and comments', () => {
    const html = [
      '<p>[[Roadmap]]</p>',
      `<p><a href="viejo.html" data-g-to="${OTHER_ID}">Ya</a></p>`,
      '<p><a data-g-pending="Roadmap">uno</a> y <a data-g-pending="hoja de ruta">dos</a></p>',
      '<p><a data-g-pending="Nota fantasma">fantasma</a></p>',
      '<!-- data-g-pending="Roadmap" -->',
      '<pre><code>data-g-pending="Roadmap"</code></pre>',
    ].join('');
    const result = promotePendingAnchors({
      html,
      fromPath: 'a.html',
      note: CREATED,
    });
    expect(result.anchors.map((anchor) => anchor.pendingTitle)).toEqual([
      'Roadmap',
      'hoja de ruta',
    ]);
    expect(result.anchors.every((anchor) => anchor.href === 'docs/roadmap.html')).toBe(true);
    expect(result.html).toContain('[[Roadmap]]');
    expect(result.html).toContain(`data-g-to="${OTHER_ID}"`);
    expect(result.html).toContain('href="viejo.html"');
    expect(result.html).toContain('data-g-pending="Nota fantasma"');
    expect(result.html).toContain('<!-- data-g-pending="Roadmap" -->');
    expect(result.html).toContain('<code>data-g-pending="Roadmap"</code>');
    expect(result.html.match(/data-g-pending="Roadmap"/g)).toHaveLength(2);
    expect(result.html).not.toContain('data-g-pending="hoja de ruta"');
  });

  it('does not treat a spaced title as its slug and prefers title when an alias folds the same way', () => {
    const spaced = promotePendingAnchors({
      html: '<p><a data-g-pending="nota-fantasma">x</a></p>',
      fromPath: 'a.html',
      note: { id: CREATED_ID, path: 'nota.html', title: 'Nota fantasma' },
    });
    expect(spaced.html).toBe('<p><a data-g-pending="nota-fantasma">x</a></p>');
    expect(spaced.anchors).toEqual([]);

    const titled = promotePendingAnchors({
      html: '<p><a data-g-pending="Roadmap">x</a></p>',
      fromPath: 'a.html',
      note: { id: CREATED_ID, path: 'roadmap.html', title: 'Roadmap', aliases: ['roadmap'] },
    });
    expect(titled.anchors[0]).toMatchObject({ matchedBy: 'title' });
  });

  it('drops a stale href, keeps a single-quoted pending value, and preserves a BOM', () => {
    const quoted = promotePendingAnchors({
      html: `<p><a href="old.html#sec" data-g-pending='Roadmap'>x</a></p>`,
      fromPath: 'old/a.html',
      note: { id: CREATED_ID, path: 'new/roadmap.html', title: 'Roadmap' },
    });
    expect(quoted.html).toBe(
      `<p><a href="../new/roadmap.html" data-g-to="${CREATED_ID}">x</a></p>`,
    );
    expect(quoted.html).not.toContain('old.html');
    expect(quoted.html).not.toContain('#sec');

    const bom = promotePendingAnchors({
      html: '\uFEFF<p><a data-g-pending="Roadmap">x</a></p>',
      fromPath: 'a.html',
      note: { id: CREATED_ID, path: 'roadmap.html', title: 'Roadmap' },
    });
    expect(bom.html.startsWith('\uFEFF')).toBe(true);
    expect(bom.html).toContain(`data-g-to="${CREATED_ID}"`);
  });

  it('is idempotent and does not rewrite a canonical anchor that also has data-g-pending', () => {
    const once = promotePendingAnchors({
      html: '<p><a data-g-pending="Roadmap">x</a></p>',
      fromPath: 'a.html',
      note: { id: CREATED_ID, path: 'roadmap.html', title: 'Roadmap' },
    });
    const twice = promotePendingAnchors({
      html: once.html,
      fromPath: 'a.html',
      note: { id: CREATED_ID, path: 'roadmap.html', title: 'Roadmap' },
    });
    expect(twice.html).toBe(once.html);
    expect(twice.anchors).toEqual([]);

    const mixed = `<p><a href="ya.html" data-g-to="${OTHER_ID}" data-g-pending="Roadmap">x</a></p>`;
    const left = promotePendingAnchors({
      html: mixed,
      fromPath: 'a.html',
      note: { id: CREATED_ID, path: 'roadmap.html', title: 'Roadmap' },
    });
    expect(left.html).toBe(mixed);
    expect(left.anchors).toEqual([]);
  });

  it('rejects a missing title, a non-ULID id, an unsafe path, and a non-string alias', () => {
    expect(() =>
      promotePendingAnchors({
        html: '<p></p>',
        fromPath: 'a.html',
        note: { id: CREATED_ID, path: 'a.html', title: '   ' },
      }),
    ).toThrow(GavetaError);
    expect(() =>
      promotePendingAnchors({
        html: '<p></p>',
        fromPath: 'a.html',
        note: { id: 'not-a-ulid', path: 'a.html', title: 'Roadmap' },
      }),
    ).toThrow(expect.objectContaining({ code: 'E_ARG_INVALID' }));
    expect(() =>
      promotePendingAnchors({
        html: '<p></p>',
        fromPath: '../fuera.html',
        note: { id: CREATED_ID, path: 'a.html', title: 'Roadmap' },
      }),
    ).toThrow(expect.objectContaining({ code: 'E_PATH_OUTSIDE_VAULT' }));
    expect(() =>
      promotePendingAnchors({
        html: '<p></p>',
        fromPath: 'a.html',
        note: { id: CREATED_ID, path: 'javascript:alert(1)', title: 'Roadmap' },
      }),
    ).toThrow(expect.objectContaining({ code: 'E_UNSAFE_URL' }));
    expect(() =>
      promotePendingAnchors({
        html: '<p></p>',
        fromPath: 'a.html',
        note: {
          id: CREATED_ID,
          path: 'a.html',
          title: 'Roadmap',
          aliases: ['ok', 1 as unknown as string],
        },
      }),
    ).toThrow(expect.objectContaining({ code: 'E_ARG_INVALID' }));
    const extra = {
      html: '<p></p>',
      fromPath: 'a.html',
      note: { id: CREATED_ID, path: 'a.html', title: 'Roadmap', extra: true },
    };
    expect(() => promotePendingAnchors(extra)).toThrow(
      expect.objectContaining({ code: 'E_ARG_INVALID' }),
    );
  });
});

describe('promotePendingLinks', () => {
  it('rewrites indexed notes when a matching note is created and updates the graph', async () => {
    await withTemp(async (parent) => {
      const root = await makeVault(parent);
      const kept = noteHtml({
        title: 'Sigue pendiente',
        id: OTHER_ID,
        body: '<a data-g-pending="Nota fantasma">Nota fantasma</a>',
      });
      const origin = noteHtml({
        title: 'Origen',
        id: SOURCE_ID,
        body: '<a data-g-pending="roadmap" rel="related">ver</a> <a data-g-pending="Nota fantasma">Nota fantasma</a>',
      });
      const nested = noteHtml({
        title: 'Anidada',
        id: NESTED_ID,
        body: '<a data-g-pending="Hoja de ruta">mapa</a>',
      });
      const created = noteHtml({
        title: 'Roadmap',
        id: CREATED_ID,
        aliases: 'Plan, Hoja de ruta',
        body: 'Destino',
      });
      await writeNote(root, 'sigue.html', kept);
      await writeNote(root, 'origen.html', origin);
      await writeNote(root, 'carpeta/anidada.html', nested);
      await writeNote(root, 'docs/roadmap.html', created);
      const beforeKept = await stat(join(root, 'sigue.html'));

      await withIndex(root, async (index) => {
        const result = await promotePendingLinks({ vaultRoot: root, index, note: CREATED });
        expect(result.notes.map((note) => note.path)).toEqual([
          'carpeta/anidada.html',
          'origen.html',
        ]);
        expect(result.notes[0]?.anchors).toEqual([
          {
            pendingTitle: 'Hoja de ruta',
            href: '../docs/roadmap.html',
            text: 'mapa',
            matchedBy: 'alias',
          },
        ]);
        expect(result.notes[1]?.anchors[0]).toMatchObject({
          pendingTitle: 'roadmap',
          href: 'docs/roadmap.html',
          matchedBy: 'title',
        });

        const originHtml = await readFile(join(root, 'origen.html'), 'utf8');
        expect(originHtml).toContain(
          `<a href="docs/roadmap.html" data-g-to="${CREATED_ID}" rel="related">ver</a>`,
        );
        expect(originHtml).toContain('data-g-pending="Nota fantasma"');
        const validation = validateNote(originHtml);
        expect(validation.diagnostics.some((item) => item.code === 'W_LINK_PENDING')).toBe(true);
        expect(
          validation.diagnostics.filter((item) => item.code === 'W_LINK_PENDING'),
        ).toHaveLength(1);
        const parsed = parseNote(originHtml);
        expect(parsed.note?.links.map((link) => link.kind)).toEqual(['canonical', 'pending']);

        expect(await readFile(join(root, 'sigue.html'), 'utf8')).toBe(kept);
        const afterKept = await stat(join(root, 'sigue.html'));
        expect(afterKept.mtimeMs).toBe(beforeKept.mtimeMs);

        const again = await promotePendingLinks({ vaultRoot: root, index, note: CREATED });
        expect(again.notes).toEqual([]);
        expect(await readFile(join(root, 'origen.html'), 'utf8')).toBe(originHtml);

        const graph = globalGraph(index);
        expect(graph.nodes.some((node) => node.ghost && node.title === 'Roadmap')).toBe(false);
        expect(graph.nodes.some((node) => node.ghost && node.title === 'Hoja de ruta')).toBe(false);
        expect(graph.nodes.some((node) => node.ghost && node.title === 'Nota fantasma')).toBe(true);
        expect(graph.edges).toEqual(
          expect.arrayContaining([
            { source: 'origen.html', target: 'docs/roadmap.html', rel: 'related' },
            { source: 'carpeta/anidada.html', target: 'docs/roadmap.html', rel: null },
          ]),
        );
        const stored = index.links('origen.html').find((link) => link.text === 'ver');
        expect(stored).toMatchObject({
          kind: 'canonical',
          targetId: CREATED_ID,
          href: 'docs/roadmap.html',
          pendingTitle: null,
          rel: 'related',
        });
      });
    });
  });

  it('promotes a pending inside the new note once that note is indexed', async () => {
    await withTemp(async (parent) => {
      const root = await makeVault(parent);
      const created = noteHtml({
        title: 'Roadmap',
        id: CREATED_ID,
        body: '<a data-g-pending="Roadmap">yo</a>',
      });
      await writeNote(root, 'docs/roadmap.html', created);
      await withIndex(root, async (index) => {
        const result = await promotePendingLinks({
          vaultRoot: root,
          index,
          note: { id: CREATED_ID, path: 'docs/roadmap.html', title: 'Roadmap' },
        });
        expect(result.notes.map((note) => note.path)).toEqual(['docs/roadmap.html']);
        const html = await readFile(join(root, 'docs/roadmap.html'), 'utf8');
        expect(html).toContain(`<a href="roadmap.html" data-g-to="${CREATED_ID}">yo</a>`);
        expect(index.links('docs/roadmap.html')[0]).toMatchObject({
          kind: 'canonical',
          targetId: CREATED_ID,
        });
      });
    });
  });

  it('rejects an index that belongs to a different vault', async () => {
    await withTemp(async (parent) => {
      const root = await makeVault(parent);
      const other = await makeVault(join(parent, 'other-parent'));
      const origin = noteHtml({
        title: 'Origen',
        body: '<a data-g-pending="Roadmap">ver</a>',
      });
      await writeNote(root, 'origen.html', origin);
      await withIndex(other, async (index) => {
        await expect(
          promotePendingLinks({
            vaultRoot: root,
            index,
            note: { id: CREATED_ID, path: 'roadmap.html', title: 'Roadmap' },
          }),
        ).rejects.toMatchObject({ code: 'E_ARG_INVALID' });
        expect(await readFile(join(root, 'origen.html'), 'utf8')).toBe(origin);
      });
    });
  });

  it('rejects a target path outside the vault before writing', async () => {
    await withTemp(async (parent) => {
      const root = await makeVault(parent);
      const origin = noteHtml({
        title: 'Origen',
        body: '<a data-g-pending="Roadmap">ver</a>',
      });
      await writeNote(root, 'origen.html', origin);
      const secret = join(parent, 'secret.html');
      await writeFile(secret, 'TOP-SECRET');
      await withIndex(root, async (index) => {
        await expect(
          promotePendingLinks({
            vaultRoot: root,
            index,
            note: { id: CREATED_ID, path: '../secret.html', title: 'Roadmap' },
          }),
        ).rejects.toMatchObject({ code: 'E_PATH_OUTSIDE_VAULT' });
        expect(await readFile(join(root, 'origen.html'), 'utf8')).toBe(origin);
        expect(await readFile(secret, 'utf8')).toBe('TOP-SECRET');
      });
    });
  });
});
