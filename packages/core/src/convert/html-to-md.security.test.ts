import { describe, expect, it } from 'vitest';
import { convertHtmlToMarkdown } from './html-to-md.ts';

const SHELL = `<!doctype html><html lang="es"><head>
<meta charset="utf-8"><title>Hostil</title>
<meta name="gaveta:id" content="01JB7Z3K9QX4T5M2N8V6R0WYHC">
<meta name="gaveta:type" content="doc">
<meta name="gaveta:created" content="2026-10-22T10:00:00Z">
<meta name="gaveta:updated" content="2026-10-22T10:00:00Z">
</head><body><article>`;

function hostileIndexOf(markdown: string, needle: string): number {
  return markdown.toLowerCase().indexOf(needle.toLowerCase());
}

describe('convertHtmlToMarkdown security', () => {
  it('does not emit javascript: URLs from hostile anchors', () => {
    const html = `${SHELL}<p><a href="javascript:alert(1)">malicioso</a></p></article></body></html>`;
    const exported = convertHtmlToMarkdown(html, { notePath: 'hostil.html' });
    expect(hostileIndexOf(exported.markdown, 'javascript:')).toBe(-1);
  });

  it('does not emit script tags from embedded hostile HTML blocks', () => {
    const html = `${SHELL}<div><script>alert(1)</script><p>seguro</p></div></article></body></html>`;
    const exported = convertHtmlToMarkdown(html, { notePath: 'hostil.html' });
    expect(hostileIndexOf(exported.markdown, '<script')).toBe(-1);
    expect(hostileIndexOf(exported.markdown, 'alert(1)')).toBe(-1);
    expect(exported.markdown.includes('seguro')).toBe(true);
  });

  it('strips event handlers from embedded HTML', () => {
    const html = `${SHELL}<p onclick="evil()">texto</p></article></body></html>`;
    const exported = convertHtmlToMarkdown(html, { notePath: 'hostil.html' });
    expect(hostileIndexOf(exported.markdown, 'onclick')).toBe(-1);
  });
});
