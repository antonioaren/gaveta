import { describe, expect, it } from 'vitest';
import { normalizeNote } from '../normalize.ts';
import { validateNote } from '../validate.ts';
import { MERMAID_LIB_ROLE, MERMAID_SCRIPT_ATTR } from './assets.ts';
import { sanitizeMermaidSource } from './normalize.ts';

const NOTE_ID = '01JB7Z3K9QX4T5M2N8V6R0WYHC';
const CREATED = '2026-10-22T10:00:00Z';

function doc(body: string, extraHead = ''): string {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Diagrama</title><meta name="gaveta:id" content="${NOTE_ID}"><meta name="gaveta:type" content="doc"><meta name="gaveta:created" content="${CREATED}">${extraHead}</head><body>${body}</body></html>`;
}

describe('mermaid security', () => {
  it('strips injected script tags while keeping diagram source', () => {
    const malicious = doc(
      [
        '<article>',
        '<h1>Flujo</h1>',
        '<script>alert(1)</script>',
        '<pre class="mermaid">graph LR\n  A-->B</pre>',
        '<script src="https://cdn.jsdelivr.net/npm/mermaid"></script>',
        '</article>',
      ].join(''),
    );
    const normalized = normalizeNote(malicious, { notePath: 'flujo.html' });
    expect(normalized.ok).toBe(true);
    const html = normalized.html ?? '';
    let scriptCount = 0;
    let from = 0;
    while (from < html.length) {
      const at = html.indexOf('<script', from);
      if (at === -1) {
        break;
      }
      scriptCount += 1;
      from = at + 7;
    }
    expect(scriptCount).toBe(2);
    expect(html).toContain('data-gaveta="mermaid-lib"');
    expect(html).not.toContain('cdn.jsdelivr.net');
    expect(validateNote(html, { notePath: 'flujo.html' }).ok).toBe(true);
  });

  it('removes javascript click directives from diagram source', () => {
    const dirty = 'graph LR\n  A-->B\nclick A call javascript:alert(1)';
    expect(sanitizeMermaidSource(dirty)).toBe('graph LR\n  A-->B');
  });

  it('rejects untrusted head scripts even when diagrams are present', () => {
    const html = doc(
      '<article><h1>X</h1><pre class="mermaid">graph LR\n  A-->B</pre></article>',
      '<script>alert(1)</script>',
    );
    const normalized = normalizeNote(html, { notePath: 'x.html' });
    expect(validateNote(normalized.html ?? '', { notePath: 'x.html' }).ok).toBe(true);
    const bad = (normalized.html ?? '').replace(
      `${MERMAID_SCRIPT_ATTR}="${MERMAID_LIB_ROLE}"`,
      `${MERMAID_SCRIPT_ATTR}="evil"`,
    );
    expect(validateNote(bad, { notePath: 'x.html' }).ok).toBe(false);
  });
});
