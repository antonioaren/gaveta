import { readFileSync } from 'node:fs';
import { join, posix } from 'node:path';
import { loadMarkdownManifest, markdownVaultPath } from '@gaveta/fixtures';
import remarkFrontmatter from 'remark-frontmatter';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import { describe, expect, it } from 'vitest';
import { unified } from 'unified';
import { visit } from 'unist-util-visit';
import type { Root as MdastRoot } from 'mdast';
import { convertMarkdownToHtml, finalizeMarkdownHtml } from './md-to-html.ts';
import {
  convertHtmlToMarkdown,
  type HtmlExportTarget,
  type HtmlToMarkdownOptions,
} from './html-to-md.ts';

const VAULT = markdownVaultPath();
const MANIFEST = loadMarkdownManifest();
const NOTE_ID = '01JB7Z3K9QX4T5M2N8V6R0WYHC';
const NOW = '2026-10-22T12:00:00.000Z';

function readMd(relativePath: string): string {
  return readFileSync(join(VAULT, relativePath), 'utf8');
}

function fixtureHtml(relativePath: string): string {
  const markdown = readMd(relativePath);
  const converted = convertMarkdownToHtml(markdown, { sourcePath: relativePath });
  const finalized = finalizeMarkdownHtml(converted, {
    id: NOTE_ID,
    now: NOW,
    notePath: relativePath.replace(/\.md$/i, '.html'),
  });
  expect(finalized.ok).toBe(true);
  return finalized.html ?? '';
}

function normalizeMdast(markdown: string): MdastRoot {
  const processor = unified()
    .use(remarkParse)
    .use(remarkFrontmatter, ['yaml'])
    .use(remarkGfm, { singleTilde: false });
  const tree: MdastRoot = processor.parse(markdown);
  stripPositions(tree);
  return tree;
}

function stripPositions(node: MdastRoot): void {
  visit(node, (visited) => {
    if ('position' in visited) {
      delete (visited as { position?: unknown }).position;
    }
  });
}

function mdastToComparableJson(tree: MdastRoot): string {
  return JSON.stringify(tree, (_key, value: unknown) => {
    if (typeof value === 'string') {
      return value.replace(/\s+/g, ' ').trim();
    }
    return value;
  });
}

function stripFrontMatter(markdown: string): string {
  if (!markdown.startsWith('---\n')) {
    return markdown;
  }
  const end = markdown.indexOf('\n---\n', 4);
  if (end === -1) {
    return markdown;
  }
  return markdown.slice(end + 5);
}

function expectRoundTrip(relativePath: string, options: HtmlToMarkdownOptions = {}): void {
  const source = readMd(relativePath);
  const html = fixtureHtml(relativePath);
  const exported = convertHtmlToMarkdown(html, {
    ...options,
    notePath: relativePath.replace(/\.md$/i, '.html'),
  });
  const roundTrip = normalizeMdast(stripFrontMatter(exported.markdown));
  const original = normalizeMdast(stripFrontMatter(source));
  expect(mdastToComparableJson(roundTrip)).toBe(mdastToComparableJson(original));
}

describe('convertHtmlToMarkdown', () => {
  it('writes front matter from gaveta meta tags', () => {
    const exported = convertHtmlToMarkdown(fixtureHtml('metadatos/front-matter-completo.md'), {
      notePath: 'metadatos/front-matter-completo.html',
    });
    expect(exported.markdown.startsWith('---\n')).toBe(true);
    expect(exported.markdown).toContain('title: Front matter completo');
    expect(exported.markdown).toContain('type: doc');
    expect(exported.markdown).toContain('created: 2026-09-01');
    expect(exported.markdown).toContain('aliases:');
    expect(exported.markdown).toContain('tags:');
  });

  it('preserves raw wikilinks from imported markdown', () => {
    const exported = convertHtmlToMarkdown(fixtureHtml('enlaces/wikilinks.md'), {
      notePath: 'enlaces/wikilinks.html',
    });
    expect(exported.markdown).toContain('[[Destino Wikilinks]]');
    expect(exported.markdown).toContain('[[Destino Wikilinks|alias visible]]');
    expect(exported.markdown).toContain('[[Destino Wikilinks#Resumen]]');
    expect(exported.markdown).toContain('[[Nota fantasma inexistente]]');
  });

  it('maps canonical links to wikilinks when resolveTarget is provided', () => {
    const html = `<!doctype html><html lang="es"><head>
<meta charset="utf-8"><title>Enlace</title>
<meta name="gaveta:id" content="${NOTE_ID}">
<meta name="gaveta:type" content="doc">
<meta name="gaveta:created" content="2026-10-22T10:00:00Z">
<meta name="gaveta:updated" content="2026-10-22T10:00:00Z">
</head><body><article><h1>Enlace</h1>
<p><a href="../enlaces/destino-wikilinks.html" data-g-to="TARGET">Destino Wikilinks</a></p>
</article></body></html>`;
    const resolveTarget = (id: string): HtmlExportTarget | null =>
      id === 'TARGET'
        ? { id, title: 'Destino Wikilinks', path: 'enlaces/destino-wikilinks.html' }
        : null;
    const exported = convertHtmlToMarkdown(html, {
      links: 'wiki',
      notePath: 'enlaces/wikilinks.html',
      resolveTarget,
    });
    expect(exported.markdown).toContain('[[Destino Wikilinks]]');
  });

  it('maps canonical links to relative .md paths when links mode is relative', () => {
    const html = `<!doctype html><html lang="es"><head>
<meta charset="utf-8"><title>Rel</title>
<meta name="gaveta:id" content="${NOTE_ID}">
<meta name="gaveta:type" content="doc">
<meta name="gaveta:created" content="2026-10-22T10:00:00Z">
<meta name="gaveta:updated" content="2026-10-22T10:00:00Z">
</head><body><article><h1>Rel</h1>
<p><a href="../corpus/grupo-a/nota-005.html" data-g-to="TARGET">Nota 005</a></p>
</article></body></html>`;
    const exported = convertHtmlToMarkdown(html, {
      links: 'relative',
      notePath: 'enlaces/enlaces-relativos.html',
      resolveTarget: () => ({
        id: 'TARGET',
        title: 'Nota 005',
        path: 'corpus/grupo-a/nota-005.html',
      }),
    });
    expect(exported.markdown).toContain('](../corpus/grupo-a/nota-005.md)');
  });

  it('maps pending links to wikilinks', () => {
    const html = `<!doctype html><html lang="es"><head>
<meta charset="utf-8"><title>Pendiente</title>
<meta name="gaveta:id" content="${NOTE_ID}">
<meta name="gaveta:type" content="doc">
<meta name="gaveta:created" content="2026-10-22T10:00:00Z">
<meta name="gaveta:updated" content="2026-10-22T10:00:00Z">
</head><body><article><h1>Pendiente</h1>
<p><a data-g-pending="Fantasma">Fantasma</a></p>
</article></body></html>`;
    const exported = convertHtmlToMarkdown(html, { notePath: 'x.html' });
    expect(exported.markdown).toContain('[[Fantasma]]');
  });

  it('exports GFM tasks with due metadata', () => {
    const exported = convertHtmlToMarkdown(fixtureHtml('tareas/tareas-fechas.md'), {
      notePath: 'tareas/tareas-fechas.html',
    });
    expect(exported.markdown).toContain('- [ ]');
    expect(exported.markdown).toContain('📅 2026-10-22');
    expect(exported.markdown).toContain('📅 2026-11-01');
    expect(exported.markdown).toContain('- [x]');
  });

  it('exports callouts as Obsidian blockquotes', () => {
    const exported = convertHtmlToMarkdown(fixtureHtml('contenido/callouts-completos.md'), {
      notePath: 'contenido/callouts-completos.html',
    });
    expect(exported.markdown).toContain('> [!note]');
    expect(exported.markdown).toContain('> [!warning]');
    expect(exported.markdown).toContain('> [!danger]');
  });

  it('exports mermaid blocks as fenced mermaid', () => {
    const exported = convertHtmlToMarkdown(fixtureHtml('contenido/mermaid.md'), {
      notePath: 'contenido/mermaid.html',
    });
    expect(exported.markdown).toContain('```mermaid');
    expect(exported.markdown).toContain('flowchart LR');
  });

  it('exports slides separated by horizontal rules with marp front matter', () => {
    const exported = convertHtmlToMarkdown(fixtureHtml('presentacion/diapositivas-marp.md'), {
      notePath: 'presentacion/diapositivas-marp.html',
    });
    expect(exported.markdown).toContain('marp: true');
    expect(exported.markdown).toContain('type: slides');
    expect(exported.markdown.match(/\n---\n/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(exported.markdown).toContain('```mermaid');
  });

  it('warns when rel is preserved in gaveta front matter', () => {
    const html = `<!doctype html><html lang="es"><head>
<meta charset="utf-8"><title>Rel</title>
<meta name="gaveta:id" content="${NOTE_ID}">
<meta name="gaveta:type" content="doc">
<meta name="gaveta:created" content="2026-10-22T10:00:00Z">
<meta name="gaveta:updated" content="2026-10-22T10:00:00Z">
</head><body><article><h1>Rel</h1>
<p><a href="destino.html" data-g-to="TARGET" rel="depends-on">Destino</a></p>
</article></body></html>`;
    const exported = convertHtmlToMarkdown(html, {
      notePath: 'enlaces/wikilinks.html',
      resolveTarget: () => ({
        id: 'TARGET',
        title: 'Destino Wikilinks',
        path: 'enlaces/destino-wikilinks.html',
      }),
    });
    expect(exported.warnings.some((warning) => warning.code === 'W_EXPORT_LOSSY')).toBe(true);
    expect(exported.markdown).toContain('gaveta:');
    expect(exported.markdown).toContain('depends-on');
  });

  it('embeds unsupported dashboard markup as HTML with a lossy warning', () => {
    const html = `<!doctype html><html lang="es"><head>
<meta charset="utf-8"><title>Panel</title>
<meta name="gaveta:id" content="${NOTE_ID}">
<meta name="gaveta:type" content="dashboard">
<meta name="gaveta:created" content="2026-10-22T10:00:00Z">
<meta name="gaveta:updated" content="2026-10-22T10:00:00Z">
</head><body><article class="g-dashboard"><h1>Panel</h1>
<gaveta-kpi class="g-kpi" data-label="KPI">42</gaveta-kpi>
</article></body></html>`;
    const exported = convertHtmlToMarkdown(html, { notePath: 'panel.html' });
    expect(exported.warnings.some((warning) => warning.code === 'W_EXPORT_LOSSY')).toBe(true);
    expect(exported.markdown).toContain('<gaveta-kpi');
  });

  it('round-trips mermaid fences through md → html → md', () => {
    expectRoundTrip('contenido/mermaid.md');
    const exported = convertHtmlToMarkdown(fixtureHtml('contenido/mermaid.md'), {
      notePath: 'contenido/mermaid.html',
    });
    expect(exported.markdown).toContain('```mermaid');
    const again = convertMarkdownToHtml(exported.markdown, { sourcePath: 'contenido/mermaid.md' });
    expect(again.body).toContain('<pre class="mermaid">');
  });

  it('round-trips supported fixture notes through md → html → md', () => {
    const reversible = [
      'metadatos/front-matter-completo.md',
      'enlaces/wikilinks.md',
      'tareas/tareas-basicas.md',
      'contenido/mermaid.md',
      'contenido/codigo.md',
      'contenido/codigo-angulos.md',
    ];
    for (const path of reversible) {
      expectRoundTrip(path);
    }
  });

  it('exports every manifest note without throwing', () => {
    for (const path of MANIFEST.notePaths) {
      const html = fixtureHtml(path);
      const exported = convertHtmlToMarkdown(html, {
        notePath: path.replace(/\.md$/i, '.html'),
        resolveTarget: (id) =>
          id === NOTE_ID
            ? {
                id: NOTE_ID,
                title: 'Fixture',
                path: path.replace(/\.md$/i, '.html'),
              }
            : null,
      });
      expect(exported.markdown.length).toBeGreaterThan(0);
    }
  });

  it('computes relative md paths from html note paths', () => {
    const from = 'enlaces/enlaces-relativos.html';
    const to = 'corpus/grupo-a/nota-005.html';
    const relative = posix.relative(posix.dirname(from), to).replace(/\.html$/i, '.md');
    expect(relative).toBe('../corpus/grupo-a/nota-005.md');
  });
});
