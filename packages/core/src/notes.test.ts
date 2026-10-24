import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildArtifactBody, readArtifactSrcdoc } from './artifact.ts';
import {
  GAVETA_DIRECTORY,
  GavetaError,
  backlinks,
  createDefaultVaultConfig,
  createNote,
  editNote,
  linkNote,
  globalGraph,
  graphGhostKey,
  isUlid,
  localGraph,
  noteContentHash,
  openVaultIndex,
  outgoingLinks,
  readNote,
  readVaultText,
  writeVaultConfig,
  type VaultIndex,
} from './index.ts';

const NOW = '2026-10-22T12:00:00.000Z';
const ID_A = '01JB7Z3K9QX4T5M2N8V6R0WYHC';
const ID_B = '01JB8A2M4R7C9D1E3F5G7H9J0K';
const ID_C = '01JB9C3N5S8D0E2F4G6H8J1K2M';
const ID_ARTIFACT = '01JC0F6R8T1G3H5J7K9M2N4P6Q';
const HASH = `sha256:${'ab'.repeat(32)}`;

const FIXED = [
  '<!doctype html><html lang="es"><head>',
  '<meta charset="utf-8">',
  '<title>Fija</title>',
  `<meta name="gaveta:id" content="${ID_A}">`,
  '<meta name="gaveta:type" content="doc">',
  '<meta name="gaveta:created" content="2026-10-22T00:00:00.000Z">',
  '<link rel="stylesheet" href=".gaveta/theme.css">',
  '</head><body><article><h1>Fija</h1>',
  '<section id="keep"><p>igual</p></section>',
  '<section id="edit"><p>viejo</p></section>',
  '</article></body></html>',
].join('');

async function withTemp(run: (directory: string) => Promise<void>): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), 'gaveta-notes-'));
  try {
    await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function makeVault(parent: string): Promise<string> {
  const root = join(parent, 'vault');
  await mkdir(join(root, GAVETA_DIRECTORY), { recursive: true });
  await writeVaultConfig(root, createDefaultVaultConfig());
  return root;
}

async function withIndex<T>(root: string, run: (index: VaultIndex) => T): Promise<T> {
  const index = await openVaultIndex(root);
  try {
    return run(index);
  } finally {
    index.close();
  }
}

async function expectCode(run: () => Promise<unknown>, code: string): Promise<unknown> {
  try {
    await run();
  } catch (error) {
    expect(error).toMatchObject({ code });
    return error;
  }
  throw new Error(`expected ${code}`);
}

async function names(root: string): Promise<readonly string[]> {
  return readdir(root, { recursive: true });
}

describe('createNote', () => {
  it('normalizes a bare article, fills metadata, and returns the content hash', async () => {
    await withTemp(async (parent) => {
      const root = await makeVault(parent);
      const created = await createNote({
        vaultRoot: root,
        title: 'Decisión',
        type: 'doc',
        folder: 'decisiones',
        tags: ['indice', 'sql'],
        aliases: ['Apodo'],
        html: '<article><h1>Cuerpo</h1><p>texto propio</p></article>',
        now: NOW,
        id: ID_A,
      });
      expect(created.ok).toBe(true);
      if (!created.ok) {
        return;
      }
      expect(created.path).toBe('decisiones/decision.html');
      expect(created.id).toBe(ID_A);
      expect(created.hash).toBe(noteContentHash(await readVaultText(root, created.path)));
      const html = await readVaultText(root, created.path);
      expect(html).toContain('texto propio');
      expect(html).toContain('name="gaveta:tags" content="indice, sql"');
      expect(html).toContain('name="gaveta:aliases" content="Apodo"');
      expect(html).toContain(`content="${NOW}"`);
      expect(html).toContain('href="../.gaveta/theme.css"');
      expect(html.endsWith('\n')).toBe(true);
      expect((await names(root)).some((name) => name.includes('.tmp'))).toBe(false);
    });
  });

  it('accepts a full document, keeps the body, and generates an id', async () => {
    await withTemp(async (parent) => {
      const root = await makeVault(parent);
      const created = await createNote({
        vaultRoot: root,
        title: 'Desde documento',
        type: 'doc',
        html: '<!doctype html><html><head><title>Otro</title></head><body><article><p>del documento</p></article></body></html>',
        now: NOW,
      });
      expect(created.ok).toBe(true);
      if (!created.ok) {
        return;
      }
      expect(isUlid(created.id)).toBe(true);
      expect(created.path).toBe('desde-documento.html');
      const html = await readVaultText(root, created.path);
      expect(html).toContain('del documento');
      expect(html).toContain('Desde documento');
      expect(html).not.toContain('<title>Otro</title>');
    });
  });

  it('builds a skeleton for slides and todo when the body is empty', async () => {
    await withTemp(async (parent) => {
      const root = await makeVault(parent);
      const slides = await createNote({
        vaultRoot: root,
        title: 'Charla',
        type: 'slides',
        html: '',
        now: NOW,
        id: ID_A,
      });
      const todo = await createNote({
        vaultRoot: root,
        title: 'Pendientes',
        type: 'todo',
        now: NOW,
        id: ID_B,
      });
      expect(slides.ok && todo.ok).toBe(true);
      if (!slides.ok || !todo.ok) {
        return;
      }
      expect(await readVaultText(root, slides.path)).toContain('class="slide"');
      expect(await readVaultText(root, todo.path)).toContain('class="tasks"');
    });
  });

  it('suffixes a colliding slug with -2', async () => {
    await withTemp(async (parent) => {
      const root = await makeVault(parent);
      await createNote({ vaultRoot: root, title: 'Nota', type: 'doc', now: NOW, id: ID_A });
      const second = await createNote({
        vaultRoot: root,
        title: 'Nota!',
        type: 'doc',
        now: NOW,
        id: ID_B,
      });
      expect(second.ok && second.path).toBe('nota-2.html');
    });
  });

  it('keeps [[Other]] as a ghost until Other is created, then promotes the backlink', async () => {
    await withTemp(async (parent) => {
      const root = await makeVault(parent);
      const origin = await createNote({
        vaultRoot: root,
        title: 'Origen',
        type: 'doc',
        html: '<article><h1>Origen</h1><p>Ver [[Other]]</p></article>',
        now: NOW,
        id: ID_A,
      });
      expect(origin.ok).toBe(true);
      if (!origin.ok) {
        return;
      }
      expect(origin.links.pending.some((link) => link.title === 'Other')).toBe(true);
      expect(origin.warnings.some((warning) => warning.code === 'W_LINK_PENDING')).toBe(true);
      const pendingHtml = await readVaultText(root, origin.path);
      expect(pendingHtml.includes('data-g-pending="Other"')).toBe(true);
      expect(pendingHtml.includes('[[Other]]')).toBe(false);

      await withIndex(root, (index) => {
        const ghost = graphGhostKey('Other');
        const graph = globalGraph(index);
        expect(graph.nodes.some((node) => node.key === ghost && node.ghost)).toBe(true);
        expect(
          graph.edges.some((edge) => edge.source === origin.path && edge.target === ghost),
        ).toBe(true);
        const local = localGraph(index, origin.path, { depth: 1 });
        expect(local.nodes.some((node) => node.key === ghost)).toBe(true);
        const outgoing = outgoingLinks(index, 'Origen');
        expect(outgoing.some((link) => link.target.ghost && link.target.title === 'Other')).toBe(
          true,
        );
        expect(() => backlinks(index, 'Other')).toThrow(GavetaError);
        try {
          backlinks(index, 'Other');
        } catch (error) {
          expect(error).toMatchObject({ code: 'E_REF_NOT_FOUND' });
        }
      });

      const target = await createNote({
        vaultRoot: root,
        title: 'Other',
        type: 'doc',
        html: '<article><h1>Other</h1><p>Destino.</p></article>',
        now: NOW,
        id: ID_B,
      });
      expect(target.ok).toBe(true);
      if (!target.ok) {
        return;
      }
      expect(target.promoted.some((note) => note.path === origin.path)).toBe(true);
      const promoted = await readVaultText(root, origin.path);
      expect(promoted.includes('data-g-pending')).toBe(false);
      expect(promoted.includes(`data-g-to="${ID_B}"`)).toBe(true);

      await withIndex(root, (index) => {
        const incoming = backlinks(index, 'Other');
        expect(incoming.some((link) => link.sourcePath === origin.path)).toBe(true);
        const graph = globalGraph(index);
        expect(graph.nodes.some((node) => node.ghost)).toBe(false);
        expect(
          graph.edges.some((edge) => edge.source === origin.path && edge.target === target.path),
        ).toBe(true);
      });
    });
  });

  it('resolves [[Other]] to a canonical link when the target already exists', async () => {
    await withTemp(async (parent) => {
      const root = await makeVault(parent);
      await createNote({
        vaultRoot: root,
        title: 'Other',
        type: 'doc',
        now: NOW,
        id: ID_B,
      });
      const origin = await createNote({
        vaultRoot: root,
        title: 'Origen',
        type: 'doc',
        html: '<article><h1>Origen</h1><p>Ver [[Other]]</p></article>',
        now: NOW,
        id: ID_A,
      });
      expect(origin.ok).toBe(true);
      if (!origin.ok) {
        return;
      }
      expect(origin.links.resolved.some((link) => link.path === 'other.html')).toBe(true);
      expect(origin.links.pending).toEqual([]);
      const html = await readVaultText(root, 'origen.html');
      expect(html.includes('href="other.html"')).toBe(true);
      expect(html.includes(`data-g-to="${ID_B}"`)).toBe(true);
      expect(html.includes('data-g-pending')).toBe(false);
    });
  });

  it('rejects a duplicate id and a folder that is already a file', async () => {
    await withTemp(async (parent) => {
      const root = await makeVault(parent);
      await createNote({ vaultRoot: root, title: 'Uno', type: 'doc', now: NOW, id: ID_A });
      await expectCode(
        () => createNote({ vaultRoot: root, title: 'Dos', type: 'doc', now: NOW, id: ID_A }),
        'E_ID_DUPLICATE',
      );
      await writeFile(join(root, 'ocupado.html'), 'no es una carpeta');
      await expectCode(
        () =>
          createNote({
            vaultRoot: root,
            title: 'Tres',
            type: 'doc',
            folder: 'ocupado.html',
            now: NOW,
            id: ID_C,
          }),
        'E_PATH_EXISTS',
      );
      expect(await readFile(join(root, 'ocupado.html'), 'utf8')).toBe('no es una carpeta');
    });
  });

  it('does not write when --if-match is set on a new note', async () => {
    await withTemp(async (parent) => {
      const root = await makeVault(parent);
      await expectCode(
        () =>
          createNote({
            vaultRoot: root,
            title: 'Nueva',
            type: 'doc',
            folder: 'carpeta',
            ifMatch: HASH,
            now: NOW,
            id: ID_A,
          }),
        'E_CONFLICT',
      );
      await expect(readdir(join(root, 'carpeta'))).rejects.toThrow();
      expect((await names(root)).some((name) => name.endsWith('.html'))).toBe(false);
      await expectCode(
        () =>
          createNote({
            vaultRoot: root,
            title: 'Nueva',
            type: 'doc',
            ifMatch: 'sha256:no',
            now: NOW,
            id: ID_A,
          }),
        'E_ARG_INVALID',
      );
    });
  });
});

describe('readNote', () => {
  it('returns html, text, and an outline that includes the hash', async () => {
    await withTemp(async (parent) => {
      const root = await makeVault(parent);
      await createNote({
        vaultRoot: root,
        title: 'Lectura',
        type: 'todo',
        html: '<h1>Lectura</h1><ul class="tasks"><li data-g-task="" id="comprar"><input type="checkbox"> Comprar</li></ul>',
        now: NOW,
        id: ID_A,
      });
      const html = await readNote({ vaultRoot: root, ref: 'Lectura', as: 'html' });
      const text = await readNote({ vaultRoot: root, ref: ID_A, as: 'text' });
      const outline = await readNote({ vaultRoot: root, ref: 'lectura.html', as: 'outline' });
      const file = await readVaultText(root, 'lectura.html');
      expect(html.as).toBe('html');
      if (html.as !== 'html' || text.as !== 'text' || outline.as !== 'outline') {
        return;
      }
      expect(html.html).toBe(file);
      expect(html.hash).toBe(noteContentHash(file));
      expect(text.hash).toBe(html.hash);
      expect(text.text.includes('Comprar')).toBe(true);
      expect(outline.hash).toBe(html.hash);
      expect(outline.outline.tasks.some((task) => task.text.includes('Comprar'))).toBe(true);
      expect(outline.outline.links).toEqual([]);
    });
  });
});

describe('editNote', () => {
  it('replaces one section and leaves every other byte identical', async () => {
    await withTemp(async (parent) => {
      const root = await makeVault(parent);
      await writeFile(join(root, 'fija.html'), FIXED);
      const before = sectionBounds(FIXED, 'edit');
      const edited = await editNote({
        vaultRoot: root,
        ref: 'Fija',
        section: 'edit',
        mode: 'replace',
        html: '<p>nuevo</p>',
        ifMatch: noteContentHash(FIXED),
      });
      expect(edited.ok).toBe(true);
      if (!edited.ok) {
        return;
      }
      const next = await readVaultText(root, 'fija.html');
      expect(next.slice(0, before.openEnd)).toBe(FIXED.slice(0, before.openEnd));
      expect(next.slice(next.indexOf('</section>', before.openEnd))).toBe(
        FIXED.slice(before.close),
      );
      expect(next.includes('nuevo')).toBe(true);
      expect(next.includes('viejo')).toBe(false);
      expect(next.includes('igual')).toBe(true);
      expect(edited.section).toBe('edit');
      expect(edited.hash).toBe(noteContentHash(next));
      expect((await names(root)).some((name) => name.includes('.tmp'))).toBe(false);
    });
  });

  it('appends and prepends inside the section only', async () => {
    await withTemp(async (parent) => {
      const root = await makeVault(parent);
      await writeFile(join(root, 'fija.html'), FIXED);
      const appended = await editNote({
        vaultRoot: root,
        ref: 'fija.html',
        section: 'edit',
        mode: 'append',
        html: '<p>despues</p>',
      });
      expect(appended.ok).toBe(true);
      const afterAppend = await readVaultText(root, 'fija.html');
      const close = FIXED.indexOf('</section>', FIXED.indexOf('<section id="edit">'));
      expect(afterAppend.startsWith(FIXED.slice(0, close))).toBe(true);
      expect(afterAppend.endsWith(FIXED.slice(close))).toBe(true);
      expect(afterAppend.includes('viejo')).toBe(true);
      expect(afterAppend.includes('despues')).toBe(true);

      const prepended = await editNote({
        vaultRoot: root,
        ref: ID_A,
        section: 'edit',
        mode: 'prepend',
        html: '<p>antes</p>',
      });
      expect(prepended.ok).toBe(true);
      const afterPrepend = await readVaultText(root, 'fija.html');
      const openEnd = afterAppend.indexOf('<section id="edit">') + '<section id="edit">'.length;
      expect(afterPrepend.startsWith(afterAppend.slice(0, openEnd))).toBe(true);
      expect(afterPrepend.endsWith(afterAppend.slice(openEnd))).toBe(true);
      expect(afterPrepend.includes('antes')).toBe(true);
    });
  });

  it('replaces the article and keeps the head byte for byte', async () => {
    await withTemp(async (parent) => {
      const root = await makeVault(parent);
      await writeFile(join(root, 'fija.html'), FIXED);
      const start = FIXED.indexOf('<article>');
      const end = FIXED.indexOf('</article>') + '</article>'.length;
      const edited = await editNote({
        vaultRoot: root,
        ref: 'Fija',
        mode: 'replace',
        html: '<article><h1>Fija</h1><p>articulo nuevo</p></article>',
      });
      expect(edited.ok).toBe(true);
      if (!edited.ok) {
        return;
      }
      const next = await readVaultText(root, 'fija.html');
      expect(next.startsWith(FIXED.slice(0, start))).toBe(true);
      expect(next.endsWith(FIXED.slice(end))).toBe(true);
      expect(next.includes('articulo nuevo')).toBe(true);
      expect(edited.section).toBeNull();
    });
  });

  it('document scope leaves the file byte-identical when html is unchanged', async () => {
    await withTemp(async (parent) => {
      const root = await makeVault(parent);
      await writeFile(join(root, 'fija.html'), FIXED);
      const edited = await editNote({
        vaultRoot: root,
        ref: 'Fija',
        mode: 'replace',
        scope: 'document',
        html: FIXED,
        ifMatch: noteContentHash(FIXED),
      });
      expect(edited.ok).toBe(true);
      if (!edited.ok) {
        return;
      }
      const next = await readVaultText(root, 'fija.html');
      expect(next).toBe(FIXED);
      expect(edited.hash).toBe(noteContentHash(FIXED));
    });
  });

  it('resolves a wikilink inside the edited section and indexes the ghost', async () => {
    await withTemp(async (parent) => {
      const root = await makeVault(parent);
      await writeFile(join(root, 'fija.html'), FIXED);
      const before = sectionBounds(FIXED, 'edit');
      const edited = await editNote({
        vaultRoot: root,
        ref: 'Fija',
        section: 'edit',
        mode: 'replace',
        html: '<p>Ver [[Other]]</p>',
      });
      expect(edited.ok).toBe(true);
      const next = await readVaultText(root, 'fija.html');
      expect(next.slice(0, before.openEnd)).toBe(FIXED.slice(0, before.openEnd));
      expect(next.slice(next.indexOf('</section>', before.openEnd))).toBe(
        FIXED.slice(before.close),
      );
      expect(next.includes('data-g-pending="Other"')).toBe(true);
      await withIndex(root, (index) => {
        const outgoing = outgoingLinks(index, 'fija.html');
        expect(outgoing.some((link) => link.target.ghost && link.target.title === 'Other')).toBe(
          true,
        );
      });
    });
  });

  it('reports a missing section and does not require a hash when --if-match is omitted', async () => {
    await withTemp(async (parent) => {
      const root = await makeVault(parent);
      await writeFile(join(root, 'fija.html'), FIXED);
      await expectCode(
        () =>
          editNote({
            vaultRoot: root,
            ref: 'Fija',
            section: 'no-esta',
            mode: 'replace',
            html: '<p>nuevo</p>',
          }),
        'E_SECTION_NOT_FOUND',
      );
      expect(await readVaultText(root, 'fija.html')).toBe(FIXED);
    });
  });
});

describe('linkNote', () => {
  it('adds a canonical link in Relacionado and is idempotent', async () => {
    await withTemp(async (parent) => {
      const root = await makeVault(parent);
      await writeFile(join(root, 'fija.html'), FIXED);
      const destino = await createNote({
        vaultRoot: root,
        title: 'Destino',
        type: 'doc',
        html: '<article><h1>Destino</h1></article>',
        now: NOW,
        id: ID_B,
      });
      expect(destino.ok).toBe(true);
      if (!destino.ok) {
        return;
      }
      const first = await linkNote({ vaultRoot: root, from: ID_A, to: ID_B });
      expect(first.ok).toBe(true);
      if (!first.ok) {
        return;
      }
      expect(first.added).toBe(true);
      expect(first.section).toBe('relacionado');
      const html = await readVaultText(root, 'fija.html');
      expect(html).toContain('id="relacionado"');
      expect(html).toContain(`data-g-to="${ID_B}"`);
      const second = await linkNote({
        vaultRoot: root,
        from: ID_A,
        to: ID_B,
        text: 'Destino',
      });
      expect(second.ok).toBe(true);
      if (!second.ok) {
        return;
      }
      expect(second.added).toBe(false);
      expect(second.hash).toBe(first.hash);
      expect(await readVaultText(root, 'fija.html')).toBe(html);
      await withIndex(root, (index) => {
        const outgoing = outgoingLinks(index, 'fija.html').filter(
          (link) => link.kind === 'canonical',
        );
        expect(outgoing.filter((link) => link.target.id === ID_B)).toHaveLength(1);
      });
    });
  });

  it('adds links in the article body of an artifact note, not inside iframe srcdoc', async () => {
    await withTemp(async (parent) => {
      const root = await makeVault(parent);
      await createNote({
        vaultRoot: root,
        title: 'Destino',
        type: 'doc',
        html: '<article><h1>Destino</h1></article>',
        now: NOW,
        id: ID_B,
      });
      const artifact = await createNote({
        vaultRoot: root,
        title: 'Demo',
        type: 'artifact',
        html: buildArtifactBody({
          title: 'Demo',
          description: 'Demo',
          originalHtml: '<p>Vacío</p>',
          allowCdn: false,
        }),
        now: NOW,
        id: ID_ARTIFACT,
      });
      expect(artifact.ok).toBe(true);
      if (!artifact.ok) {
        return;
      }
      const before = await readVaultText(root, artifact.path);
      const srcdocBefore = readArtifactSrcdoc(before);
      expect(srcdocBefore).not.toBeNull();
      const linked = await linkNote({ vaultRoot: root, from: ID_ARTIFACT, to: ID_B });
      expect(linked.ok).toBe(true);
      const after = await readVaultText(root, artifact.path);
      expect(readArtifactSrcdoc(after)).toBe(srcdocBefore);
      const embedded = readArtifactSrcdoc(after);
      expect(embedded?.includes('data-g-to') ?? false).toBe(false);
      expect(after).toContain(`data-g-to="${ID_B}"`);
      expect(after.indexOf('data-g-to')).toBeGreaterThan(after.indexOf('<iframe'));
    });
  });

  it('honors --section and --rel', async () => {
    await withTemp(async (parent) => {
      const root = await makeVault(parent);
      await writeFile(join(root, 'fija.html'), FIXED);
      await createNote({
        vaultRoot: root,
        title: 'Destino',
        type: 'doc',
        html: '<article><h1>Destino</h1></article>',
        now: NOW,
        id: ID_B,
      });
      const linked = await linkNote({
        vaultRoot: root,
        from: ID_A,
        to: ID_B,
        section: 'keep',
        rel: 'related',
        text: 'ver destino',
      });
      expect(linked.ok).toBe(true);
      const html = await readVaultText(root, 'fija.html');
      expect(html).toContain('<section id="keep">');
      expect(html).toContain('rel="related"');
      expect(html).toContain('ver destino');
      expect(html).not.toContain('id="relacionado"');
    });
  });
});

describe('note arguments', () => {
  it('rejects unknown shapes', async () => {
    await withTemp(async (parent) => {
      const root = await makeVault(parent);
      await expectCode(() => createNote(null), 'E_ARG_INVALID');
      await expectCode(
        () => createNote({ vaultRoot: root, title: 'A', type: 'doc', extra: true }),
        'E_ARG_INVALID',
      );
      await expectCode(
        () => createNote({ vaultRoot: root, title: '   ', type: 'doc' }),
        'E_ARG_INVALID',
      );
      await expectCode(
        () => createNote({ vaultRoot: root, title: 'A', type: 'pagina' }),
        'E_ARG_INVALID',
      );
      await expectCode(() => readNote({ vaultRoot: root, ref: 'A', as: 'pdf' }), 'E_ARG_INVALID');
      await expectCode(
        () => editNote({ vaultRoot: root, ref: 'A', html: '<p>a</p>', mode: 'nope' }),
        'E_ARG_INVALID',
      );
      await expectCode(
        () => editNote({ vaultRoot: root, ref: 'A', html: '   ', section: 'edit', mode: 'append' }),
        'E_ARG_INVALID',
      );
      await expectCode(
        () => editNote({ vaultRoot: root, ref: 'A', html: '<p>a</p>', mode: 'append' }),
        'E_ARG_INVALID',
      );
      await expectCode(() => linkNote(null), 'E_ARG_INVALID');
      await expectCode(
        () => linkNote({ vaultRoot: root, from: 'A', to: 'B', extra: true }),
        'E_ARG_INVALID',
      );
    });
  });
});

function sectionBounds(html: string, id: string): { openEnd: number; close: number } {
  const open = `<section id="${id}">`;
  const start = html.indexOf(open);
  return { openEnd: start + open.length, close: html.indexOf('</section>', start + open.length) };
}
