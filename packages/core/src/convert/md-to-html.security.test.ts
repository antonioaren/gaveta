import { describe, expect, it } from 'vitest';
import { normalizeNote } from '../normalize.ts';
import { validateNote } from '../validate.ts';
import { convertMarkdownToHtml, finalizeMarkdownHtml } from './md-to-html.ts';

const NOTE_ID = '01JB7Z3K9QX4T5M2N8V6R0WYHC';
const NOW = '2026-10-22T12:00:00.000Z';

function hostileIndexOf(html: string, needle: string): number {
  return html.toLowerCase().indexOf(needle.toLowerCase());
}

function convertHostile(markdown: string): string {
  const converted = convertMarkdownToHtml(markdown, { sourcePath: 'hostil.md' });
  const finalized = finalizeMarkdownHtml(converted, {
    id: NOTE_ID,
    now: NOW,
    notePath: 'hostil.html',
  });
  expect(finalized.ok).toBe(true);
  const normalized = normalizeNote(finalized.html ?? '', { notePath: 'hostil.html' });
  expect(normalized.html).not.toBeNull();
  const validation = validateNote(normalized.html ?? '', { notePath: 'hostil.html' });
  expect(validation.ok).toBe(true);
  return normalized.html ?? '';
}

describe('convertMarkdownToHtml security', () => {
  it('strips script tags and event handlers from raw HTML', () => {
    const html = convertHostile(
      '# Hostil\n\n<script>alert(1)</script>\n\n<p onclick="evil()">texto seguro</p>\n',
    );
    expect(hostileIndexOf(html, '<script')).toBe(-1);
    expect(hostileIndexOf(html, 'onclick')).toBe(-1);
    expect(html.includes('texto seguro')).toBe(true);
  });

  it('rejects javascript: links during normalization', () => {
    const html = convertHostile('# Hostil\n\n[malicioso](javascript:alert(1))\n');
    expect(hostileIndexOf(html, 'javascript:')).toBe(-1);
  });

  it('drops iframe injections', () => {
    const html = convertHostile('# Hostil\n\n<iframe src="https://evil.example"></iframe>\n');
    expect(hostileIndexOf(html, '<iframe')).toBe(-1);
    expect(hostileIndexOf(html, 'evil.example')).toBe(-1);
  });

  it('does not leave markdown script fences executable', () => {
    const html = convertHostile('# Hostil\n\n```html\n<script>alert(1)</script>\n```\n');
    expect(hostileIndexOf(html, '<script')).toBe(-1);
  });
});
