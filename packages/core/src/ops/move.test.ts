import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BACKLINK_COUNT, NOTE_X, linkerSpec, vaultPath, type VaultName } from '@gaveta/fixtures';
import {
  GavetaError,
  GavetaOperationError,
  backlinks,
  globalGraph,
  moveNote,
  relativeNoteHref,
  removeNote,
  type VaultIndex,
} from '../index.ts';
import { openVaultIndex } from '../sqlite/store.ts';

const NOTE_A = '01JB7Z3K9QX4T5M2N8V6R0WYHC';
const NOTE_B = '01JB8A2M4R7C9D1E3F5G7H9J0K';

function themeHref(notePath: string): string {
  const depth = notePath.split('/').length - 1;
  return `${'../'.repeat(depth)}.gaveta/theme.css`;
}

function noteHtml(options: {
  readonly title: string;
  readonly id: string;
  readonly path: string;
  readonly body?: string;
  readonly aliases?: string;
}): string {
  const alias =
    options.aliases === undefined
      ? ''
      : `<meta name="gaveta:aliases" content="${options.aliases}" />`;
  const body = options.body ?? '<p>Cuerpo</p>';
  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <title>${options.title}</title>
    <meta name="gaveta:id" content="${options.id}" />
    <meta name="gaveta:type" content="doc" />
    <meta name="gaveta:created" content="2026-10-22T10:00:00Z" />
    ${alias}
    <link rel="stylesheet" href="${themeHref(options.path)}" />
  </head>
  <body>
    <article>
      <h1>${options.title}</h1>
      ${body}
    </article>
  </body>
</html>
`;
}

async function withTemp(run: (directory: string) => Promise<void>): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), 'gaveta-mv-'));
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

async function copyVault(parent: string, name: VaultName): Promise<string> {
  const root = join(parent, name);
  await cp(vaultPath(name), root, { recursive: true });
  return root;
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

function isAffected(value: unknown): value is { id: string | null; title: string; path: string } {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  const id = record.id;
  return (
    (id === null || typeof id === 'string') &&
    typeof record.title === 'string' &&
    typeof record.path === 'string'
  );
}

function danglingCanonical(index: VaultIndex): { path: string; targetId: string }[] {
  const ids = new Set<string>();
  for (const note of index.notes()) {
    if (note.id !== null) {
      ids.add(note.id);
    }
  }
  const dangling: { path: string; targetId: string }[] = [];
  for (const link of index.links()) {
    if (link.kind === 'canonical' && link.targetId !== null && !ids.has(link.targetId)) {
      dangling.push({ path: link.path, targetId: link.targetId });
    }
  }
  return dangling;
}

describe('moveNote', () => {
  it('rewrites the twenty incoming hrefs, moves the file, and recalculates the theme', async () => {
    await withTemp(async (parent) => {
      const root = await copyVault(parent, 'backlinks');
      const before = new Map<string, string>();
      for (let index = 1; index <= BACKLINK_COUNT; index += 1) {
        const spec = linkerSpec(index);
        before.set(spec.path, await readFile(join(root, spec.path), 'utf8'));
      }
      const original = await readFile(join(root, NOTE_X.path), 'utf8');
      const untouched = await readFile(join(root, 'formas-de-enlace.html'), 'utf8');
      const pixel = await readFile(join(root, 'attachments/pixel.png'));

      await withIndex(root, async (index) => {
        const moved = await moveNote(index, 'Nota X', 'otra/ruta');

        expect(moved).toEqual({
          id: NOTE_X.id,
          from: NOTE_X.path,
          to: 'otra/ruta.html',
          rewritten: Array.from(
            { length: BACKLINK_COUNT },
            (_, position) => linkerSpec(position + 1).path,
          ).sort((left, right) => (left < right ? -1 : left > right ? 1 : 0)),
        });
        await expect(readFile(join(root, NOTE_X.path), 'utf8')).rejects.toThrow();
        const next = await readFile(join(root, 'otra/ruta.html'), 'utf8');
        expect(next).toBe(
          original
            .replace('href=".gaveta/theme.css"', 'href="../.gaveta/theme.css"')
            .replace('src="attachments/pixel.png"', 'src="../attachments/pixel.png"'),
        );
        expect(next).toContain('href="../.gaveta/theme.css"');

        for (let position = 1; position <= BACKLINK_COUNT; position += 1) {
          const spec = linkerSpec(position);
          const previous = before.get(spec.path);
          const href = relativeNoteHref(spec.path, 'otra/ruta.html');
          expect(previous).toBeTypeOf('string');
          expect(href).toBeTypeOf('string');
          if (previous === undefined || href === null) {
            return;
          }
          const html = await readFile(join(root, spec.path), 'utf8');
          const needle = position <= 10 ? 'href="../nota-x.html"' : 'href="../../nota-x.html"';
          expect(html).toBe(previous.replace(needle, `href="${href}"`));
          expect(html).toContain(`data-g-to="${NOTE_X.id}"`);
        }

        expect(await readFile(join(root, 'formas-de-enlace.html'), 'utf8')).toBe(untouched);
        expect(await readFile(join(root, 'attachments/pixel.png'))).toEqual(pixel);
        expect(index.note(NOTE_X.path)).toBeNull();
        expect(index.note('otra/ruta.html')?.id).toBe(NOTE_X.id);
        expect(backlinks(index, 'otra/ruta.html')).toHaveLength(BACKLINK_COUNT);
        expect(danglingCanonical(index)).toEqual([]);
        const hits = index.search('Veinte');
        expect(hits.some((hit) => hit.path === 'otra/ruta.html')).toBe(true);
        for (const link of index.links()) {
          if (link.targetId !== NOTE_X.id) {
            continue;
          }
          expect(link.href).toBe(relativeNoteHref(link.path, 'otra/ruta.html'));
        }
      });
    });
  }, 30_000);

  it('resolves the source by id, path, or alias and renames inside the same directory', async () => {
    await withTemp(async (parent) => {
      const root = await copyVault(parent, 'backlinks');
      await withIndex(root, async (index) => {
        const moved = await moveNote(index, NOTE_X.id, 'equis.html');
        expect(moved.from).toBe(NOTE_X.path);
        expect(moved.to).toBe('equis.html');
        const html = await readFile(join(root, 'equis.html'), 'utf8');
        expect(html).toContain('href=".gaveta/theme.css"');
        expect(html).toContain('src="attachments/pixel.png"');
        const linker = await readFile(join(root, 'enlaces/enlace-01.html'), 'utf8');
        expect(linker).toContain('href="../equis.html"');
        expect(linker).toContain(`data-g-to="${NOTE_X.id}"`);
      });
    });
  });

  it('moves into an existing directory and keeps the file name', async () => {
    await withTemp(async (parent) => {
      const root = await copyVault(parent, 'backlinks');
      await withIndex(root, async (index) => {
        const moved = await moveNote(index, 'nota equis', 'enlaces/');
        expect(moved.to).toBe('enlaces/nota-x.html');
        const html = await readFile(join(root, moved.to), 'utf8');
        expect(html).toContain('href="../.gaveta/theme.css"');
        const sibling = await readFile(join(root, 'enlaces/enlace-01.html'), 'utf8');
        expect(sibling).toContain('href="nota-x.html"');
        const nested = await readFile(join(root, 'enlaces/mas/enlace-11.html'), 'utf8');
        expect(nested).toContain('href="../nota-x.html"');
      });
    });
  });

  it('recalculates a deeper theme path and outgoing hrefs', async () => {
    await withTemp(async (parent) => {
      const root = await makeVault(parent);
      await writeNote(
        root,
        'a/from.html',
        noteHtml({
          title: 'Origen',
          id: NOTE_A,
          path: 'a/from.html',
          body: `<p><a href="../b/to.html#resumen" data-g-to="${NOTE_B}" rel="related">Destino</a></p><p><img src="../attachments/pixel.png" alt="Pixel" /></p>`,
        }),
      );
      await writeNote(
        root,
        'b/to.html',
        noteHtml({ title: 'Destino', id: NOTE_B, path: 'b/to.html', body: '<p>Fin</p>' }),
      );
      await withIndex(root, async (index) => {
        const moved = await moveNote(index, 'a/from.html', 'c/d/from.html');
        expect(moved.to).toBe('c/d/from.html');
        const html = await readFile(join(root, 'c/d/from.html'), 'utf8');
        expect(html).toContain(`href="${themeHref('c/d/from.html')}"`);
        expect(html).toContain('href="../../b/to.html#resumen"');
        expect(html).toContain('src="../../attachments/pixel.png"');
        expect(html).toContain(`data-g-to="${NOTE_B}"`);
        expect(danglingCanonical(index)).toEqual([]);
      });
    });
  });

  it('is a no-op when the destination is the current path', async () => {
    await withTemp(async (parent) => {
      const root = await copyVault(parent, 'backlinks');
      const before = await readFile(join(root, NOTE_X.path), 'utf8');
      await withIndex(root, async (index) => {
        const moved = await moveNote(index, NOTE_X.path, 'nota-x');
        expect(moved).toEqual({
          id: NOTE_X.id,
          from: NOTE_X.path,
          to: NOTE_X.path,
          rewritten: [],
        });
        expect(await readFile(join(root, NOTE_X.path), 'utf8')).toBe(before);
      });
    });
  });

  it('rejects a destination that already exists without writing', async () => {
    await withTemp(async (parent) => {
      const root = await copyVault(parent, 'backlinks');
      const before = await readFile(join(root, 'enlaces/enlace-01.html'), 'utf8');
      await withIndex(root, async (index) => {
        await expect(moveNote(index, NOTE_X.path, 'destino-enlace.html')).rejects.toMatchObject({
          code: 'E_PATH_EXISTS',
        });
        expect(await readFile(join(root, 'enlaces/enlace-01.html'), 'utf8')).toBe(before);
        expect(index.note(NOTE_X.path)?.id).toBe(NOTE_X.id);
      });
    });
  });

  it('rejects a duplicate id before rewriting links', async () => {
    await withTemp(async (parent) => {
      const root = await copyVault(parent, 'problems');
      const before = await readFile(join(root, 'dup/duplicado-alfa.html'), 'utf8');
      await withIndex(root, async (index) => {
        await expect(
          moveNote(index, 'dup/duplicado-alfa.html', 'otro.html'),
        ).rejects.toBeInstanceOf(GavetaError);
        await expect(moveNote(index, 'dup/duplicado-alfa.html', 'otro.html')).rejects.toMatchObject(
          {
            code: 'E_ID_DUPLICATE',
          },
        );
        expect(await readFile(join(root, 'dup/duplicado-alfa.html'), 'utf8')).toBe(before);
      });
    });
  });
});

describe('removeNote', () => {
  it('fails with the affected notes and writes nothing when backlinks exist', async () => {
    await withTemp(async (parent) => {
      const root = await copyVault(parent, 'backlinks');
      const note = await readFile(join(root, NOTE_X.path), 'utf8');
      const linker = await readFile(join(root, 'enlaces/enlace-01.html'), 'utf8');
      await withIndex(root, async (index) => {
        let caught: unknown;
        try {
          await removeNote(index, NOTE_X.title);
        } catch (error) {
          caught = error;
        }
        expect(caught).toBeInstanceOf(GavetaOperationError);
        if (!(caught instanceof GavetaOperationError)) {
          return;
        }
        expect(caught.code).toBe('E_HAS_BACKLINKS');
        expect(caught.message).toContain('enlaces entrantes');
        const affected = caught.details.affected;
        expect(Array.isArray(affected)).toBe(true);
        if (!Array.isArray(affected)) {
          return;
        }
        expect(affected).toHaveLength(BACKLINK_COUNT);
        const paths = affected.map((item) => {
          if (!isAffected(item)) {
            throw new Error('affected entry is missing path');
          }
          expect(item.title.length).toBeGreaterThan(0);
          return item.path;
        });
        expect(paths).toEqual(
          [...paths].sort((left, right) => (left < right ? -1 : left > right ? 1 : 0)),
        );
        expect(paths).toContain('enlaces/enlace-01.html');
        expect(paths).toContain('enlaces/mas/enlace-20.html');
        expect(await readFile(join(root, NOTE_X.path), 'utf8')).toBe(note);
        expect(await readFile(join(root, 'enlaces/enlace-01.html'), 'utf8')).toBe(linker);
        expect(index.note(NOTE_X.path)?.id).toBe(NOTE_X.id);
      });
    });
  });

  it('converts incoming links to pending with --force and leaves no broken targets', async () => {
    await withTemp(async (parent) => {
      const root = await copyVault(parent, 'backlinks');
      await withIndex(root, async (index) => {
        const removed = await removeNote(index, NOTE_X.path, { force: true });
        expect(removed).toMatchObject({
          id: NOTE_X.id,
          path: NOTE_X.path,
          title: NOTE_X.title,
          forced: true,
        });
        expect(removed.pending).toHaveLength(BACKLINK_COUNT);
        await expect(readFile(join(root, NOTE_X.path), 'utf8')).rejects.toThrow();

        const first = await readFile(join(root, 'enlaces/enlace-01.html'), 'utf8');
        expect(first).toContain('data-g-pending="Nota X"');
        expect(first).toContain('rel="related"');
        expect(first).not.toContain(`data-g-to="${NOTE_X.id}"`);
        expect(first).not.toContain('href="../nota-x.html"');
        expect(first).toContain('El enlace 01 apunta a');

        const task = await readFile(join(root, 'enlaces/mas/enlace-20.html'), 'utf8');
        expect(task).toContain('data-g-pending="Nota X"');
        expect(task).toContain('rel="references"');
        expect(task).toContain('data-g-due="2026-10-22"');
        expect(task).toContain('checked');
        expect(task).not.toContain(`data-g-to="${NOTE_X.id}"`);

        expect(index.note(NOTE_X.path)).toBeNull();
        expect(index.links().some((link) => link.targetId === NOTE_X.id)).toBe(false);
        const pending = index.links().filter((link) => link.pendingTitle === NOTE_X.title);
        expect(pending).toHaveLength(BACKLINK_COUNT);
        expect(pending.every((link) => link.kind === 'pending' && link.ghost)).toBe(true);
        expect(danglingCanonical(index)).toEqual([]);
        const graph = globalGraph(index);
        expect(graph.nodes.some((node) => node.ghost && node.title === NOTE_X.title)).toBe(true);
        expect(graph.nodes.some((node) => node.path === NOTE_X.path)).toBe(false);
      });
    });
  });

  it('deletes a note that nothing links to', async () => {
    await withTemp(async (parent) => {
      const root = await makeVault(parent);
      await writeNote(
        root,
        'sola.html',
        noteHtml({ title: 'Sola', id: NOTE_A, path: 'sola.html' }),
      );
      await withIndex(root, async (index) => {
        const removed = await removeNote(index, 'Sola');
        expect(removed).toEqual({
          id: NOTE_A,
          path: 'sola.html',
          title: 'Sola',
          forced: false,
          pending: [],
        });
        await expect(readFile(join(root, 'sola.html'), 'utf8')).rejects.toThrow();
        expect(index.note('sola.html')).toBeNull();
      });
    });
  });

  it('does not treat a wikilink as a backlink', async () => {
    await withTemp(async (parent) => {
      const root = await makeVault(parent);
      await writeNote(
        root,
        'destino.html',
        noteHtml({ title: 'Destino', id: NOTE_B, path: 'destino.html' }),
      );
      await writeNote(
        root,
        'origen.html',
        noteHtml({
          title: 'Origen',
          id: NOTE_A,
          path: 'origen.html',
          body: '<p>[[Destino]]</p>',
        }),
      );
      await withIndex(root, async (index) => {
        const removed = await removeNote(index, 'Destino');
        expect(removed.pending).toEqual([]);
        expect(await readFile(join(root, 'origen.html'), 'utf8')).toContain('[[Destino]]');
      });
    });
  });

  it('keeps a self-link inside the moved note and a fragment on an incoming link', async () => {
    await withTemp(async (parent) => {
      const root = await makeVault(parent);
      await writeNote(
        root,
        'nota.html',
        noteHtml({
          title: 'Nota',
          id: NOTE_A,
          path: 'nota.html',
          body: `<p><a href="nota.html#inicio" data-g-to="${NOTE_A}" rel="related">Nota</a></p>`,
        }),
      );
      await writeNote(
        root,
        'otra.html',
        noteHtml({
          title: 'Otra',
          id: NOTE_B,
          path: 'otra.html',
          body: `<p>Ver <a href="nota.html#inicio" data-g-to="${NOTE_A}" rel="related">nota</a>.</p>`,
        }),
      );
      await withIndex(root, async (index) => {
        await moveNote(index, 'nota.html', 'sub/nota.html');
        const moved = await readFile(join(root, 'sub/nota.html'), 'utf8');
        expect(moved).toContain('href="nota.html#inicio"');
        expect(moved).toContain('href="../.gaveta/theme.css"');
        const other = await readFile(join(root, 'otra.html'), 'utf8');
        expect(other).toContain('href="sub/nota.html#inicio"');
        expect(danglingCanonical(index)).toEqual([]);
      });
    });
  });
});

describe('move and remove together', () => {
  it('moves twenty backlinks and then force-removes them into pending links', async () => {
    await withTemp(async (parent) => {
      const root = await copyVault(parent, 'backlinks');
      await withIndex(root, async (index) => {
        await moveNote(index, NOTE_X.path, 'otra/ruta');
        await expect(removeNote(index, 'otra/ruta.html')).rejects.toMatchObject({
          code: 'E_HAS_BACKLINKS',
        });
        const removed = await removeNote(index, 'otra/ruta.html', { force: true });
        expect(removed.path).toBe('otra/ruta.html');
        expect(removed.pending).toHaveLength(BACKLINK_COUNT);
        const linker = await readFile(join(root, 'enlaces/mas/enlace-11.html'), 'utf8');
        expect(linker).toContain('data-g-pending="Nota X"');
        expect(linker).not.toContain('nota-x.html');
        expect(danglingCanonical(index)).toEqual([]);
        expect(index.note('otra/ruta.html')).toBeNull();
      });
    });
  });
});
