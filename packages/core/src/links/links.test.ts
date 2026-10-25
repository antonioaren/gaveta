import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DUPLICATE_ID, GHOST_TITLE, NOTE_X, vaultPath, type VaultName } from '@gaveta/fixtures';
import {
  formatDiagnostic,
  GavetaError,
  GavetaRefError,
  SUGGESTED_REL,
  assessRel,
  parseNote,
  readVaultConfig,
  relativeNoteHref,
  resolveNoteLinks,
  resolveRef,
  resolveTitle,
  suggestNotes,
  type VaultIndex,
} from '../index.ts';
import { openVaultIndex } from '../sqlite/store.ts';

const NOTE_A = '01JB7Z3K9QX4T5M2N8V6R0WYHC';
const NOTE_B = '01JB8A2M4R7C9D1E3F5G7H9J0K';
const NOTE_C = '01JB9C3N5S8D0E2F4G6H8J1K2M';
const DESTINO = '01M5HGV880000000000000000S';

function noteHtml(options: {
  readonly title: string;
  readonly id?: string | null;
  readonly body?: string;
  readonly aliases?: string;
}): string {
  const id = options.id === undefined ? NOTE_A : options.id;
  const head = ['<meta charset="utf-8">', `<title>${options.title}</title>`];
  if (id !== null) {
    head.push(`<meta name="gaveta:id" content="${id}">`);
  }
  head.push('<meta name="gaveta:type" content="doc">');
  head.push('<meta name="gaveta:created" content="2026-10-22T10:00:00Z">');
  if (options.aliases !== undefined) {
    head.push(`<meta name="gaveta:aliases" content="${options.aliases}">`);
  }
  const body = options.body ?? 'Cuerpo';
  return `<!doctype html><html lang="es"><head>${head.join('')}</head><body><article><h1>${options.title}</h1><p>${body}</p></article></body></html>`;
}

async function withTemp(run: (directory: string) => Promise<void>): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), 'gaveta-links-'));
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

async function withIndex(
  root: string,
  run: (index: VaultIndex) => void | Promise<void>,
): Promise<void> {
  const index = await openVaultIndex(root);
  try {
    await index.rebuild();
    await run(index);
  } finally {
    index.close();
  }
}

describe('relative hrefs', () => {
  it('builds a vault-relative href and rejects schemes and traversal', () => {
    expect(relativeNoteHref('formas-de-enlace.html', 'destino-enlace.html')).toBe(
      'destino-enlace.html',
    );
    expect(relativeNoteHref('enlaces/enlace-01.html', 'nota-x.html')).toBe('../nota-x.html');
    expect(relativeNoteHref('enlaces/mas/enlace-11.html', 'nota-x.html')).toBe('../../nota-x.html');
    expect(relativeNoteHref('a/b.html', 'a/c.html')).toBe('c.html');
    expect(relativeNoteHref('a/b/c.html', 'a/d.html')).toBe('../d.html');
    expect(relativeNoteHref('old/a.html', 'new/b.html')).toBe('../new/b.html');
    expect(relativeNoteHref('a.html', 'javascript:alert(1)')).toBeNull();
    expect(relativeNoteHref('a.html', 'data:text/html,hi')).toBeNull();
    expect(relativeNoteHref('a.html', '/etc/passwd')).toBeNull();
    expect(relativeNoteHref('../x.html', 'a.html')).toBeNull();
  });
});

describe('resolveRef', () => {
  it('resolves id, path, then title or alias, ignoring case and accents', async () => {
    await withTemp(async (parent) => {
      const root = await makeVault(parent);
      await writeNote(
        root,
        'notas/cancion.html',
        noteHtml({ title: 'Canción', id: NOTE_A, aliases: 'Himno, Índice maestro' }),
      );
      await writeNote(root, 'roadmap.html', noteHtml({ title: 'Roadmap', id: NOTE_B }));
      await writeNote(
        root,
        'nota-x.html',
        noteHtml({ title: NOTE_C, id: NOTE_C, body: 'el título es un id' }),
      );
      await withIndex(root, (index) => {
        expect(resolveRef(index, NOTE_A.toLowerCase())).toMatchObject({
          id: NOTE_A,
          title: 'Canción',
          path: 'notas/cancion.html',
          matchedBy: 'id',
        });
        expect(resolveRef(index, './notas/cancion.html').matchedBy).toBe('path');
        expect(resolveRef(index, 'notas/../roadmap.html')).toMatchObject({
          path: 'roadmap.html',
          matchedBy: 'path',
        });
        expect(resolveRef(index, 'CANCIÓN')).toMatchObject({
          path: 'notas/cancion.html',
          matchedBy: 'title',
        });
        expect(resolveRef(index, 'indice maestro')).toMatchObject({
          matchedBy: 'alias',
          title: 'Canción',
        });
        expect(resolveRef(index, 'himno').matchedBy).toBe('alias');
        expect(resolveRef(index, ` ${NOTE_A} `).matchedBy).toBe('id');
        expect(resolveRef(index, 'roadmap.html')).toMatchObject({
          path: 'roadmap.html',
          matchedBy: 'path',
        });
        expect(() => resolveTitle(index, 'roadmap.html')).toThrow(GavetaRefError);
        expect(resolveRef(index, NOTE_C)).toMatchObject({
          path: 'nota-x.html',
          matchedBy: 'id',
        });
        expect(resolveTitle(index, NOTE_C)).toMatchObject({
          path: 'nota-x.html',
          matchedBy: 'title',
        });
      });
    });
  });

  it('prefers a real id over a title that happens to be that id', async () => {
    await withTemp(async (parent) => {
      const root = await makeVault(parent);
      await writeNote(root, 'real.html', noteHtml({ title: 'Real', id: NOTE_A }));
      await writeNote(root, 'titulado.html', noteHtml({ title: NOTE_A, id: NOTE_B }));
      await withIndex(root, (index) => {
        expect(resolveRef(index, NOTE_A)).toMatchObject({ path: 'real.html', matchedBy: 'id' });
      });
    });
  });

  it('prefers a path over a title with the same text', async () => {
    await withTemp(async (parent) => {
      const root = await makeVault(parent);
      await writeNote(root, 'roadmap.html', noteHtml({ title: 'Otra', id: NOTE_A }));
      await writeNote(root, 'otra.html', noteHtml({ title: 'roadmap.html', id: NOTE_B }));
      await withIndex(root, (index) => {
        expect(resolveRef(index, 'roadmap.html')).toMatchObject({
          path: 'roadmap.html',
          matchedBy: 'path',
        });
      });
    });
  });

  it('returns candidates when several notes share a title, alias, or id', async () => {
    await withTemp(async (parent) => {
      const root = await makeVault(parent);
      await writeNote(root, 'b.html', noteHtml({ title: 'Compartido', id: NOTE_A }));
      await writeNote(
        root,
        'a.html',
        noteHtml({ title: 'Otra', id: NOTE_B, aliases: 'compartido' }),
      );
      await writeNote(root, 'dup/beta.html', noteHtml({ title: 'Beta', id: NOTE_C }));
      await writeNote(root, 'dup/alfa.html', noteHtml({ title: 'Alfa', id: NOTE_C }));
      await withIndex(root, (index) => {
        expect(() => resolveRef(index, 'COMPARTIDO')).toThrow(GavetaRefError);
        try {
          resolveRef(index, 'COMPARTIDO');
        } catch (error) {
          expect(error).toMatchObject({
            code: 'E_REF_AMBIGUOUS',
            message: formatDiagnostic('E_REF_AMBIGUOUS').message,
            hint: formatDiagnostic('E_REF_AMBIGUOUS').hint,
            details: {
              candidates: [
                { id: NOTE_B, title: 'Otra', path: 'a.html' },
                { id: NOTE_A, title: 'Compartido', path: 'b.html' },
              ],
            },
          });
        }
        expect(() => resolveRef(index, NOTE_C)).toThrow(GavetaError);
        try {
          resolveRef(index, NOTE_C);
        } catch (error) {
          expect(error).toBeInstanceOf(GavetaRefError);
          expect(error).toMatchObject({
            code: 'E_REF_AMBIGUOUS',
            details: {
              candidates: [
                { path: 'dup/alfa.html', title: 'Alfa' },
                { path: 'dup/beta.html', title: 'Beta' },
              ],
            },
          });
        }
      });
    });
  });

  it('suggests near titles when nothing matches', async () => {
    await withTemp(async (parent) => {
      const root = await makeVault(parent);
      await writeNote(root, 'guia.html', noteHtml({ title: 'Gaveta roadmap', id: NOTE_A }));
      await writeNote(root, 'lejos.html', noteHtml({ title: 'Zzzqqq', id: NOTE_B }));
      await withIndex(root, (index) => {
        expect(() => resolveRef(index, 'Roadmp')).toThrow(GavetaRefError);
        try {
          resolveTitle(index, 'Roadmap');
        } catch (error) {
          expect(error).toMatchObject({
            code: 'E_REF_NOT_FOUND',
            message: formatDiagnostic('E_REF_NOT_FOUND').message,
          });
          if (!(error instanceof GavetaRefError)) {
            throw error;
          }
          const suggestions = error.details.suggestions;
          expect(Array.isArray(suggestions)).toBe(true);
          expect(suggestions).toEqual([
            expect.objectContaining({ title: 'Gaveta roadmap', path: 'guia.html' }),
          ]);
        }
        expect(suggestNotes(index, 'xxxxxxxxx', 5)).toEqual([]);
      });
    });
  });

  it('rejects empty refs and keeps one note when title and alias fold together', async () => {
    await withTemp(async (parent) => {
      const root = await makeVault(parent);
      await writeNote(
        root,
        'guia.html',
        noteHtml({ title: 'Guía', id: NOTE_A, aliases: 'guia, Árbol, arbol' }),
      );
      await withIndex(root, (index) => {
        expect(() => resolveRef(index, '   ')).toThrow(GavetaError);
        expect(() => resolveRef(index, 12 as unknown as string)).toThrow(GavetaError);
        expect(resolveRef(index, 'ARBOL')).toMatchObject({
          path: 'guia.html',
          matchedBy: 'alias',
        });
        expect(resolveRef(index, 'guía')).toMatchObject({ matchedBy: 'title' });
        expect(index.notesMatchingTitle('')).toEqual([]);
        expect(index.pathsMatchingAlias('   ')).toEqual([]);
        expect(() => index.notesMatchingTitle(1 as unknown as string)).toThrow(GavetaError);
      });
    });
  });
});

describe('wikilinks', () => {
  it('converts title, label, and section forms, including accents', async () => {
    await withTemp(async (parent) => {
      const root = await makeVault(parent);
      await writeNote(
        root,
        'notas/cancion.html',
        noteHtml({
          title: 'Canción',
          id: NOTE_A,
          aliases: 'Himno',
          body: '<section id="estrofa"><h2>Estrofa</h2><p>Letra</p></section>',
        }),
      );
      await withIndex(root, (index) => {
        const html =
          '<p>[[cancion]]</p><p>[[CANCIÓN|verso]]</p><p>[[Himno#Estrofa]]</p><p>[[Canción#estrofa|letra]]</p>';
        const result = resolveNoteLinks({ html, fromPath: 'otras/nota.html', index });
        expect(result.ok).toBe(true);
        expect(result.errors).toEqual([]);
        expect(result.html).toContain(
          `<a href="../notas/cancion.html" data-g-to="${NOTE_A}">Canción</a>`,
        );
        expect(result.html).toContain(
          `<a href="../notas/cancion.html" data-g-to="${NOTE_A}">verso</a>`,
        );
        expect(result.html).toContain(
          `<a href="../notas/cancion.html#estrofa" data-g-to="${NOTE_A}">Canción</a>`,
        );
        expect(result.html).toContain(
          `<a href="../notas/cancion.html#estrofa" data-g-to="${NOTE_A}">letra</a>`,
        );
        const again = resolveNoteLinks({ html: result.html, fromPath: 'otras/nota.html', index });
        expect(again.html).toBe(result.html);
      });
    });
  });

  it('stores an unresolved wikilink as a pending ghost and suggests neighbours', async () => {
    await withTemp(async (parent) => {
      const root = await makeVault(parent);
      await writeNote(root, 'guia.html', noteHtml({ title: 'Gaveta roadmap', id: NOTE_A }));
      await withIndex(root, (index) => {
        const html = '<p>[[Roadmap]]</p>';
        const result = resolveNoteLinks({ html, fromPath: 'a.html', index });
        expect(result.ok).toBe(true);
        expect(result.html).toBe('<p><a data-g-pending="Roadmap">Roadmap</a></p>');
        expect(result.html).not.toContain('href');
        expect(result.links[0]).toMatchObject({
          kind: 'pending',
          ghost: true,
          pendingTitle: 'Roadmap',
        });
        expect(result.warnings[0]).toMatchObject({
          code: 'W_LINK_PENDING',
          severity: 'warning',
          message: formatDiagnostic('W_LINK_PENDING').message,
          details: { title: 'Roadmap' },
        });
        const suggestions = result.warnings[0]?.details?.suggestions;
        expect(suggestions).toEqual([
          expect.objectContaining({ title: 'Gaveta roadmap', path: 'guia.html' }),
        ]);
        const blocked = resolveNoteLinks({
          html,
          fromPath: 'a.html',
          index,
          allowPending: false,
        });
        expect(blocked.ok).toBe(false);
        expect(blocked.html).toBe(html);
        expect(blocked.errors[0]).toMatchObject({
          code: 'E_LINK_UNRESOLVED',
          message: "No existe 'Roadmap'.",
          hint: "¿Quisiste decir 'Gaveta roadmap'?",
        });
      });
    });
  });

  it('fails the whole note when a wikilink title is ambiguous', async () => {
    await withTemp(async (parent) => {
      const root = await makeVault(parent);
      await writeNote(root, 'b.html', noteHtml({ title: 'Roadmap', id: NOTE_A }));
      await writeNote(root, 'a.html', noteHtml({ title: 'roadmap', id: NOTE_B }));
      await withIndex(root, (index) => {
        const html = '<p>[[Roadmap]]</p><p>[[Otra]]</p>';
        const result = resolveNoteLinks({ html, fromPath: 'c.html', index });
        expect(result.ok).toBe(false);
        expect(result.html).toBe(html);
        expect(result.errors[0]).toMatchObject({
          code: 'E_REF_AMBIGUOUS',
          details: {
            candidates: [
              { id: NOTE_B, title: 'roadmap', path: 'a.html' },
              { id: NOTE_A, title: 'Roadmap', path: 'b.html' },
            ],
          },
        });
      });
    });
  });

  it('does not treat a wikilink as an id or a path, and does not promote pending anchors', async () => {
    await withTemp(async (parent) => {
      const root = await makeVault(parent);
      await writeNote(root, 'nota-x.html', noteHtml({ title: 'Nota X', id: NOTE_A }));
      await withIndex(root, (index) => {
        const html = `<p>[[${NOTE_A}]]</p><p>[[nota-x.html]]</p><p><a data-g-pending="Nota X">Nota X</a></p>`;
        const result = resolveNoteLinks({ html, fromPath: 'a.html', index });
        expect(result.ok).toBe(true);
        expect(result.html).toContain(`data-g-pending="${NOTE_A}"`);
        expect(result.html).toContain('data-g-pending="nota-x.html"');
        expect(result.html).toContain('<a data-g-pending="Nota X">Nota X</a>');
        expect(result.html).not.toContain(`data-g-to="${NOTE_A}"`);
        expect(result.links.filter((link) => link.ghost)).toHaveLength(3);
      });
    });
  });

  it('leaves wikilinks inside code, pre, and script, and escapes labels', async () => {
    await withTemp(async (parent) => {
      const root = await makeVault(parent);
      await writeNote(root, 'roadmap.html', noteHtml({ title: 'Roadmap', id: NOTE_A }));
      await withIndex(root, (index) => {
        const html =
          '<p><code>[[Roadmap]]</code></p><pre>[[Roadmap]]</pre><script>[[Roadmap]]</script><p>[[Roadmap|&lt;b&gt;"cita"&lt;/b&gt;]]</p>';
        const result = resolveNoteLinks({ html, fromPath: 'a.html', index });
        expect(result.ok).toBe(true);
        expect(result.html).toContain('<code>[[Roadmap]]</code>');
        expect(result.html).toContain('<pre>[[Roadmap]]</pre>');
        expect(result.html).toContain('<script>[[Roadmap]]</script>');
        expect(result.html).toContain(
          `<a href="roadmap.html" data-g-to="${NOTE_A}">&lt;b&gt;"cita"&lt;/b&gt;</a>`,
        );
      });
    });
  });

  it('caps a very deep tree without throwing', async () => {
    await withTemp(async (parent) => {
      const root = await makeVault(parent);
      await writeNote(root, 'roadmap.html', noteHtml({ title: 'Roadmap', id: NOTE_A }));
      await withIndex(root, (index) => {
        const html = `${'<div>'.repeat(120)}[[Roadmap]]${'</div>'.repeat(120)}`;
        const result = resolveNoteLinks({ html, fromPath: 'a.html', index });
        expect(result.ok).toBe(true);
        expect(result.html).toContain('[[Roadmap]]');
      });
    });
  });
});

describe('href repair and rel', () => {
  it('repairs href from data-g-to after a move and preserves a safe fragment', async () => {
    await withTemp(async (parent) => {
      const root = await makeVault(parent);
      await writeNote(
        root,
        'old/a.html',
        noteHtml({
          title: 'Origen',
          id: NOTE_A,
          body: `<a href="b.html#resumen" data-g-to="${NOTE_B}" rel="related">B</a>`,
        }),
      );
      await writeNote(
        root,
        'old/b.html',
        noteHtml({
          title: 'Destino',
          id: NOTE_B,
          body: '<section id="resumen"><h2>Resumen</h2><p>Ok</p></section>',
        }),
      );
      const index = await openVaultIndex(root);
      try {
        await index.rebuild();
        await rm(join(root, 'old', 'b.html'));
        await writeNote(root, 'new/b.html', noteHtml({ title: 'Destino', id: NOTE_B }));
        await index.remove('old/b.html');
        await index.upsert('new/b.html');
        const html = await readFile(join(root, 'old', 'a.html'), 'utf8');
        const result = resolveNoteLinks({ html, fromPath: 'old/a.html', index });
        expect(result.ok).toBe(true);
        expect(result.html).toContain(`href="../new/b.html#resumen"`);
        expect(result.html).not.toContain('href="b.html');
        expect(result.html).toContain('rel="related"');
        expect(result.links[0]).toMatchObject({
          repairedHref: true,
          targetId: NOTE_B,
          broken: false,
          section: 'resumen',
        });
        const twice = resolveNoteLinks({ html: result.html, fromPath: 'old/a.html', index });
        expect(twice.html).toBe(result.html);
        expect(twice.links[0]?.repairedHref).toBe(false);
      } finally {
        index.close();
      }
    });
  });

  it('inserts a missing href and drops an unsafe fragment', async () => {
    await withTemp(async (parent) => {
      const root = await makeVault(parent);
      await writeNote(root, 'nota.html', noteHtml({ title: 'Nota', id: NOTE_A }));
      await withIndex(root, (index) => {
        const missing = `<p><a data-g-to="${NOTE_A}">Nota</a></p>`;
        const inserted = resolveNoteLinks({ html: missing, fromPath: 'otra.html', index });
        expect(inserted.html).toContain(`href="nota.html"`);
        expect(inserted.html).toContain(`data-g-to="${NOTE_A}"`);
        const dirty = `<p><a href="mal.html#javascript:alert(1)" data-g-to="${NOTE_A}">Nota</a></p>`;
        const repaired = resolveNoteLinks({ html: dirty, fromPath: 'otra.html', index });
        expect(repaired.html).toContain('href="nota.html"');
        expect(repaired.html).not.toContain('javascript');
      });
    });
  });

  it('leaves a broken data-g-to in place', async () => {
    await withTemp(async (parent) => {
      const root = await makeVault(parent);
      await writeNote(root, 'a.html', noteHtml({ title: 'A', id: NOTE_A }));
      await withIndex(root, (index) => {
        const html = `<p><a href="no-existe.html" data-g-to="${NOTE_B}" rel="related">No</a></p>`;
        const result = resolveNoteLinks({ html, fromPath: 'a.html', index });
        expect(result.ok).toBe(true);
        expect(result.html).toBe(html);
        expect(result.links[0]).toMatchObject({ broken: true, repairedHref: false });
      });
    });
  });

  it('warns on an unknown rel and adds noopener on external links', async () => {
    await withTemp(async (parent) => {
      const root = await makeVault(parent);
      await writeNote(root, 'a.html', noteHtml({ title: 'A', id: NOTE_A }));
      await withIndex(root, (index) => {
        const external = '<p><a href="https://example.com">Example</a></p>';
        const opened = resolveNoteLinks({ html: external, fromPath: 'a.html', index });
        expect(opened.html).toBe('<p><a href="https://example.com" rel="noopener">Example</a></p>');
        const sponsored = '<p><a href="https://example.com" rel="sponsored">Example</a></p>';
        const warned = resolveNoteLinks({ html: sponsored, fromPath: 'a.html', index });
        expect(warned.ok).toBe(true);
        expect(warned.html).toBe(
          '<p><a href="https://example.com" rel="sponsored noopener">Example</a></p>',
        );
        expect(warned.warnings[0]).toMatchObject({
          code: 'W_REL_UNKNOWN',
          severity: 'warning',
          details: { rel: 'sponsored' },
        });
        const safe = '<p><a href="https://example.com" rel="noopener noreferrer">Example</a></p>';
        expect(resolveNoteLinks({ html: safe, fromPath: 'a.html', index }).html).toBe(safe);
        const mailto = '<p><a href="mailto:a@b.c">Correo</a></p>';
        expect(resolveNoteLinks({ html: mailto, fromPath: 'a.html', index }).html).toContain(
          'rel="noopener"',
        );
        const strict = resolveNoteLinks({
          html: sponsored,
          fromPath: 'a.html',
          index,
          rel: { strict: true, vocabulary: [...SUGGESTED_REL] },
        });
        expect(strict.ok).toBe(false);
        expect(strict.html).toBe(sponsored);
        expect(strict.errors[0]).toMatchObject({ code: 'W_REL_UNKNOWN', severity: 'error' });
        const internal = `<p><a href="nota.html" data-g-to="${NOTE_A}" rel="sponsored">A</a></p>`;
        const kept = resolveNoteLinks({ html: internal, fromPath: 'a.html', index });
        expect(kept.ok).toBe(true);
        expect(kept.html).toContain('rel="sponsored"');
        expect(kept.warnings.map((warning) => warning.code)).toEqual(['W_REL_UNKNOWN']);
      });
    });
  });

  it('reports assessRel for a closed vocabulary', () => {
    const strict = assessRel('custom', { strict: true, vocabulary: [] }, null, false);
    expect(strict.error).toBe(true);
    expect(strict.diagnostics[0]).toMatchObject({ code: 'W_REL_UNKNOWN', severity: 'error' });
    expect(strict.nextRel).toBeNull();
    const external = assessRel(null, { strict: false, vocabulary: [...SUGGESTED_REL] }, null, true);
    expect(external.nextRel).toBe('noopener');
    expect(external.diagnostics).toEqual([]);
  });
});

describe('fixture vaults', () => {
  it('resolves backlink refs and the wikilink forms', async () => {
    await withTemp(async (parent) => {
      const root = await copyVault(parent, 'backlinks');
      const config = await readVaultConfig(root);
      await withIndex(root, async (index) => {
        expect(resolveRef(index, NOTE_X.id)).toMatchObject({
          path: NOTE_X.path,
          title: NOTE_X.title,
          matchedBy: 'id',
        });
        expect(resolveRef(index, 'nota-x.html').matchedBy).toBe('path');
        expect(resolveRef(index, 'nota equis')).toMatchObject({
          path: NOTE_X.path,
          matchedBy: 'alias',
        });
        expect(resolveRef(index, 'NOTA X').matchedBy).toBe('title');
        const html = await readFile(join(root, 'formas-de-enlace.html'), 'utf8');
        const parsed = parseNote(html);
        expect(parsed.note?.links.filter((link) => link.kind === 'wikilink')).toHaveLength(3);
        const result = resolveNoteLinks({
          html,
          fromPath: 'formas-de-enlace.html',
          index,
          rel: { strict: config.rel.strict, vocabulary: config.rel.vocabulary },
        });
        expect(result.ok).toBe(true);
        expect(result.html).toContain(
          '<a href="destino-enlace.html" data-g-to="01M5HGV8800000000000000002">Destino enlace</a>',
        );
        expect(result.html).toContain(
          '<a href="destino-enlace.html" data-g-to="01M5HGV8800000000000000002">texto visible</a>',
        );
        expect(result.html).toContain(
          '<a href="destino-enlace.html#resumen" data-g-to="01M5HGV8800000000000000002">Destino enlace</a>',
        );
        expect(result.html).toContain(`<a data-g-pending="${GHOST_TITLE}">${GHOST_TITLE}</a>`);
        expect(result.html).toContain('href=".gaveta/theme.css"');
        expect(result.links.filter((link) => link.ghost)).toHaveLength(1);
        expect(result.warnings.map((warning) => warning.code)).toEqual(['W_LINK_PENDING']);
        const nested = resolveNoteLinks({
          html: '<p>[[Nota X]]</p>',
          fromPath: 'enlaces/mas/enlace-11.html',
          index,
        });
        expect(nested.html).toContain(`href="../../nota-x.html" data-g-to="${NOTE_X.id}"`);
      });
    });
  });

  it('repairs the stale href in the problems vault and keeps the broken link', async () => {
    await withTemp(async (parent) => {
      const root = await copyVault(parent, 'problems');
      await withIndex(root, async (index) => {
        expect(() => resolveRef(index, DUPLICATE_ID)).toThrow(GavetaRefError);
        const stale = await readFile(join(root, 'href-desfasado.html'), 'utf8');
        const repaired = resolveNoteLinks({ html: stale, fromPath: 'href-desfasado.html', index });
        expect(repaired.ok).toBe(true);
        expect(repaired.html).toContain(`href="nota-destino.html"`);
        expect(repaired.html).toContain(`data-g-to="${DESTINO}"`);
        expect(repaired.html).not.toContain('ruta-incorrecta.html');
        expect(repaired.links[0]).toMatchObject({ repairedHref: true, broken: false });
        const broken = await readFile(join(root, 'nota-rota.html'), 'utf8');
        const left = resolveNoteLinks({ html: broken, fromPath: 'nota-rota.html', index });
        expect(left.html).toContain('href="no-existe.html"');
        expect(left.links[0]?.broken).toBe(true);
        const pending = await readFile(join(root, 'nota-pendiente.html'), 'utf8');
        const ghost = resolveNoteLinks({ html: pending, fromPath: 'nota-pendiente.html', index });
        expect(ghost.html).toBe(pending);
        expect(ghost.links[0]).toMatchObject({ ghost: true, pendingTitle: GHOST_TITLE });
        expect(ghost.warnings[0]?.code).toBe('W_LINK_PENDING');
      });
    });
  });
});

describe('argument checks', () => {
  it('rejects a bad fromPath, policy, and non-string html', async () => {
    await withTemp(async (parent) => {
      const root = await makeVault(parent);
      await withIndex(root, (index) => {
        expect(() =>
          resolveNoteLinks({ html: 1 as unknown as string, fromPath: 'a.html', index }),
        ).toThrow(GavetaError);
        expect(() => resolveNoteLinks({ html: '<p></p>', fromPath: '../x.html', index })).toThrow(
          GavetaError,
        );
        expect(() =>
          resolveNoteLinks({
            html: '<p></p>',
            fromPath: 'a.html',
            index,
            rel: { strict: true, vocabulary: [''] },
          }),
        ).toThrow(GavetaError);
        expect(suggestNotes(index, 'nota', 0)).toEqual([]);
      });
    });
  });
});
