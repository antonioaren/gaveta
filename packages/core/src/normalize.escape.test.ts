import { describe, expect, it } from 'vitest';
import { normalizeNote, parseNote, validateNote } from './index.ts';

const NOTE_ID = '01JB7Z3K9QX4T5M2N8V6R0WYHC';
const CREATED = '2026-10-22T10:00:00Z';

function meta(name: string, content: string): string {
  return `<meta name="${name}" content="${content}" />`;
}

function shell(body: string): string {
  return [
    '<!doctype html>',
    '<html lang="es">',
    '  <head>',
    '    <meta charset="utf-8" />',
    '    <title>Esc</title>',
    `    ${meta('gaveta:id', NOTE_ID)}`,
    '    <meta name="gaveta:type" content="doc" />',
    `    ${meta('gaveta:created', CREATED)}`,
    '    <link rel="stylesheet" href=".gaveta/theme.css" />',
    '  </head>',
    '  <body>',
    body,
    '  </body>',
    '</html>',
    '',
  ].join('\n');
}

function hostileIndexOf(html: string, needle: string): number {
  return html.toLowerCase().indexOf(needle.toLowerCase());
}

describe('normalizeNote text escaping', () => {
  it('keeps escaped angle brackets inside inline code and comparisons', () => {
    const input = shell(
      '<article><h1>Esc</h1><p><code>a/&lt;n&gt;/b</code> y 1 &lt; 2</p></article>',
    );
    const once = normalizeNote(input, { notePath: 'esc.html' });
    expect(once.ok).toBe(true);
    expect(once.diagnostics).toEqual([]);
    const html = once.html ?? '';
    expect(html).toContain('<code>a/&lt;n&gt;/b</code>');
    expect(html).toContain('1 &lt; 2');
    expect(hostileIndexOf(html, '<n>')).toBe(-1);
    expect(validateNote(html, { notePath: 'esc.html' }).ok).toBe(true);
    const twice = normalizeNote(html, { notePath: 'esc.html' });
    expect(twice.html).toBe(html);
    expect(twice.diagnostics).toEqual([]);
  });

  it.each([
    'a &lt; b',
    'a &gt; b',
    'a &amp; b',
    'comillas &quot;dentro&quot;',
    '.claude/skills/&lt;n&gt;/SKILL.md',
    '/batch &lt;instrucción&gt;',
    '&lt;nnn-slug&gt;',
    '&lt;script&gt;alert(1)&lt;/script&gt;',
  ])('escapes hostile inline text %j without inventing elements', (snippet) => {
    const input = shell(`<article><h1>T</h1><p><code>x</code> ${snippet}</p></article>`);
    const result = normalizeNote(input, { notePath: 'inline.html' });
    expect(result.ok).toBe(true);
    const html = result.html ?? '';
    expect(hostileIndexOf(html, '<script')).toBe(-1);
    expect(validateNote(html, { notePath: 'inline.html' }).ok).toBe(true);
    const parsed = parseNote(html);
    expect(parsed.ok).toBe(true);
    expect(normalizeNote(html, { notePath: 'inline.html' }).html).toBe(html);
  });
});
