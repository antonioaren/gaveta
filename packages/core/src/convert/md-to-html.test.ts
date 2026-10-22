import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadMarkdownManifest, markdownVaultPath } from '@gaveta/fixtures';
import { describe, expect, it } from 'vitest';
import { normalizeNote } from '../normalize.ts';
import { parseNote } from '../parser.ts';
import { validateNote } from '../validate.ts';
import { convertMarkdownToHtml, finalizeMarkdownHtml } from './md-to-html.ts';

const VAULT = markdownVaultPath();
const MANIFEST = loadMarkdownManifest();
const NOTE_ID = '01JB7Z3K9QX4T5M2N8V6R0WYHC';
const NOW = '2026-10-22T12:00:00.000Z';

function readMd(relativePath: string): string {
  return readFileSync(join(VAULT, relativePath), 'utf8');
}

function expectValidNote(relativePath: string, markdown: string): string {
  const converted = convertMarkdownToHtml(markdown, { sourcePath: relativePath });
  const finalized = finalizeMarkdownHtml(converted, {
    id: NOTE_ID,
    now: NOW,
    notePath: relativePath.replace(/\.md$/i, '.html'),
  });
  expect(finalized.ok).toBe(true);
  expect(finalized.html).not.toBeNull();
  const validation = validateNote(finalized.html ?? '', {
    notePath: relativePath.replace(/\.md$/i, '.html'),
  });
  expect(validation.ok).toBe(true);
  return finalized.html ?? '';
}

describe('convertMarkdownToHtml', () => {
  it('maps front matter metadata and keeps the doc article shell', () => {
    const result = convertMarkdownToHtml(readMd('metadatos/front-matter-completo.md'), {
      sourcePath: 'metadatos/front-matter-completo.md',
    });
    expect(result.title).toBe('Front matter completo');
    expect(result.type).toBe('doc');
    expect(result.tags).toEqual(['metadatos', 'demo']);
    expect(result.aliases).toEqual(['FM completo', 'Metadatos demo']);
    expect(result.created).toBe('2026-09-01');
    expect(result.body).toContain('<article>');
    expect(result.body).toContain('<h1>Front matter completo</h1>');
    const html = expectValidNote(
      'metadatos/front-matter-completo.md',
      readMd('metadatos/front-matter-completo.md'),
    );
    expect(html).toContain('name="gaveta:tags" content="metadatos, demo"');
    expect(html).toContain('name="gaveta:aliases" content="FM completo, Metadatos demo"');
    expect(html).toContain('name="gaveta:created" content="2026-09-01"');
  });

  it('defaults the title from the first h1 or the filename', () => {
    const fromH1 = convertMarkdownToHtml(readMd('metadatos/titulo-desde-encabezado.md'), {
      sourcePath: 'metadatos/titulo-desde-encabezado.md',
    });
    expect(fromH1.title).toBe('Título desde encabezado');

    const fromName = convertMarkdownToHtml(readMd('metadatos/solo-nombre-archivo.md'), {
      sourcePath: 'metadatos/solo-nombre-archivo.md',
    });
    expect(fromName.title).toBe('solo-nombre-archivo');
  });

  it('preserves wikilinks as raw bracket text for the resolver', () => {
    const result = convertMarkdownToHtml(readMd('enlaces/wikilinks.md'), {
      sourcePath: 'enlaces/wikilinks.md',
    });
    expect(result.body).toContain('[[Destino Wikilinks]]');
    expect(result.body).toContain('[[Destino Wikilinks|alias visible]]');
    expect(result.body).toContain('[[Destino Wikilinks#Resumen]]');
    expect(result.body).toContain('[[Destino Wikilinks#Detalle|alias de sección]]');
    expect(result.body).toContain('[[Nota fantasma inexistente]]');
    const html = expectValidNote('enlaces/wikilinks.md', readMd('enlaces/wikilinks.md'));
    const note = parseNote(html).note;
    expect(note?.links.filter((link) => link.kind === 'wikilink')).toHaveLength(6);
  });

  it('keeps relative Markdown links as href targets', () => {
    const result = convertMarkdownToHtml(readMd('enlaces/enlaces-relativos.md'), {
      sourcePath: 'enlaces/enlaces-relativos.md',
    });
    expect(result.body).toContain('href="destino-wikilinks.md"');
    expect(result.body).toContain('href="../corpus/grupo-a/nota-005.md"');
    expect(result.body).toContain('href="../indice.md"');
    expect(result.body).toContain('href="destino-wikilinks.md#resumen"');
    expect(result.body).toContain('href="no-existe.md"');
    expectValidNote('enlaces/enlaces-relativos.md', readMd('enlaces/enlaces-relativos.md'));
  });

  it('maps GFM tasks to ul.tasks with metadata', () => {
    const result = convertMarkdownToHtml(readMd('tareas/tareas-fechas.md'), {
      sourcePath: 'tareas/tareas-fechas.md',
    });
    expect(result.type).toBe('todo');
    expect(result.body).toContain('<ul class="tasks">');
    expect(result.body).toContain('data-g-due="2026-10-22"');
    expect(result.body).toContain('data-g-due="2026-11-01"');
    const html = expectValidNote('tareas/tareas-fechas.md', readMd('tareas/tareas-fechas.md'));
    const tasks = parseNote(html).note?.tasks ?? [];
    expect(tasks.some((task) => task.due === '2026-10-22')).toBe(true);
    expect(tasks.some((task) => task.due === '2026-11-01')).toBe(true);
  });

  it('maps Obsidian callouts to aside.callout with contract kinds', () => {
    const result = convertMarkdownToHtml(readMd('contenido/callouts-completos.md'), {
      sourcePath: 'contenido/callouts-completos.md',
    });
    expect(result.body).toContain('<aside class="callout" data-kind="note">');
    expect(result.body).toContain('<aside class="callout" data-kind="info">');
    expect(result.body).toContain('<aside class="callout" data-kind="warning">');
    expect(result.body).toContain('<aside class="callout" data-kind="danger">');
    expectValidNote('contenido/callouts-completos.md', readMd('contenido/callouts-completos.md'));
  });

  it('warns on foldable callout markers', () => {
    const result = convertMarkdownToHtml(readMd('contenido/callouts-plegables.md'), {
      sourcePath: 'contenido/callouts-plegables.md',
    });
    expect(result.warnings.some((warning) => warning.code === 'W_IMPORT_UNSUPPORTED')).toBe(true);
    expectValidNote('contenido/callouts-plegables.md', readMd('contenido/callouts-plegables.md'));
  });

  it('maps fenced mermaid blocks to pre.mermaid', () => {
    const result = convertMarkdownToHtml(readMd('contenido/mermaid.md'), {
      sourcePath: 'contenido/mermaid.md',
    });
    expect(result.body).toContain('<pre class="mermaid">');
    expect(result.body).toContain('flowchart LR');
    expectValidNote('contenido/mermaid.md', readMd('contenido/mermaid.md'));
  });

  it('splits marp slides on horizontal rules', () => {
    const result = convertMarkdownToHtml(readMd('presentacion/diapositivas-marp.md'), {
      sourcePath: 'presentacion/diapositivas-marp.md',
    });
    expect(result.type).toBe('slides');
    expect(result.body.match(/<section class="slide"/g)?.length).toBe(3);
    expect(result.body).toContain('<pre class="mermaid">');
    expectValidNote(
      'presentacion/diapositivas-marp.md',
      readMd('presentacion/diapositivas-marp.md'),
    );
  });

  it('maps wiki image embeds and relative images', () => {
    const result = convertMarkdownToHtml(readMd('contenido/imagenes.md'), {
      sourcePath: 'contenido/imagenes.md',
    });
    expect(result.body).toContain('src="../attachments/pixel.png"');
    expect(result.body).toContain('src="../attachments/icono.svg"');
    expectValidNote('contenido/imagenes.md', readMd('contenido/imagenes.md'));
  });

  it('warns on unsupported transclusion embeds', () => {
    const result = convertMarkdownToHtml(readMd('no-soportado/embed-nota.md'), {
      sourcePath: 'no-soportado/embed-nota.md',
    });
    expect(result.warnings.some((warning) => warning.code === 'W_IMPORT_UNSUPPORTED')).toBe(true);
    expect(result.body).toContain('![[../enlaces/destino-wikilinks.md]]');
    expectValidNote('no-soportado/embed-nota.md', readMd('no-soportado/embed-nota.md'));
  });

  it('converts every manifest note to valid normalized HTML', () => {
    for (const path of MANIFEST.notePaths) {
      const markdown = readMd(path);
      const converted = convertMarkdownToHtml(markdown, { sourcePath: path });
      const finalized = finalizeMarkdownHtml(converted, {
        id: NOTE_ID,
        now: NOW,
        notePath: path.replace(/\.md$/i, '.html'),
      });
      expect(finalized.ok, path).toBe(true);
      const validation = validateNote(finalized.html ?? '', {
        notePath: path.replace(/\.md$/i, '.html'),
      });
      expect(validation.ok, path).toBe(true);
      const normalized = normalizeNote(finalized.html ?? '', {
        notePath: path.replace(/\.md$/i, '.html'),
      });
      expect(normalized.html).not.toBeNull();
    }
  });
});
