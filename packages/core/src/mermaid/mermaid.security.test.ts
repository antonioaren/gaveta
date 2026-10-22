import { parse } from 'parse5';
import type { DefaultTreeAdapterMap } from 'parse5';
import { describe, expect, it } from 'vitest';
import { normalizeNote } from '../normalize.ts';
import { validateNote } from '../validate.ts';
import {
  MERMAID_BOOT_ROLE,
  MERMAID_LIB_ROLE,
  MERMAID_SCRIPT_ATTR,
  expectedMermaidScriptSrc,
  mermaidAssetHref,
} from './assets.ts';
import { isTrustedMermaidScript, sanitizeMermaidSource } from './normalize.ts';

const NOTE_ID = '01JB7Z3K9QX4T5M2N8V6R0WYHC';
const CREATED = '2026-10-22T10:00:00Z';
const NOTE_PATH = 'docs/diagrama.html';

type ParseElement = DefaultTreeAdapterMap['element'];

function doc(body: string, extraHead = ''): string {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Diagrama</title><meta name="gaveta:id" content="${NOTE_ID}"><meta name="gaveta:type" content="doc"><meta name="gaveta:created" content="${CREATED}">${extraHead}</head><body>${body}</body></html>`;
}

function scriptElement(html: string): ParseElement {
  const document = parse(html, { scriptingEnabled: false });
  const stack: DefaultTreeAdapterMap['childNode'][] = [...document.childNodes];
  while (stack.length > 0) {
    const node = stack.pop();
    if (node === undefined) {
      continue;
    }
    if (node.nodeName === '#text' || node.nodeName === '#comment') {
      continue;
    }
    const element = node as ParseElement;
    if (element.tagName.toLowerCase() === 'script') {
      return element;
    }
    for (let index = element.childNodes.length - 1; index >= 0; index -= 1) {
      const child = element.childNodes[index];
      if (child !== undefined) {
        stack.push(child);
      }
    }
  }
  throw new Error('no script');
}

function trustedLibTag(): string {
  const src = expectedMermaidScriptSrc(NOTE_PATH, MERMAID_LIB_ROLE);
  return `<script defer ${MERMAID_SCRIPT_ATTR}="${MERMAID_LIB_ROLE}" src="${src}"></script>`;
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

  it('rejects a marked script with a remote src', () => {
    const element = scriptElement(
      `<script defer ${MERMAID_SCRIPT_ATTR}="${MERMAID_LIB_ROLE}" src="https://evil.example/x.js"></script>`,
    );
    expect(isTrustedMermaidScript(element, NOTE_PATH)).toBe(false);
    const html = doc(
      '<article><pre class="mermaid">graph LR\n  A-->B</pre></article>',
      `<script defer ${MERMAID_SCRIPT_ATTR}="${MERMAID_LIB_ROLE}" src="https://evil.example/x.js"></script>`,
    );
    expect(validateNote(html, { notePath: NOTE_PATH }).ok).toBe(false);
    const normalized = normalizeNote(html, { notePath: NOTE_PATH });
    expect(normalized.html).not.toContain('evil.example');
    expect(validateNote(normalized.html ?? '', { notePath: NOTE_PATH }).ok).toBe(true);
  });

  it('rejects a marked script with inline body content', () => {
    const element = scriptElement(
      `<script defer ${MERMAID_SCRIPT_ATTR}="${MERMAID_LIB_ROLE}" src="${mermaidAssetHref(NOTE_PATH, 'mermaid.min.js')}">alert(1)</script>`,
    );
    expect(isTrustedMermaidScript(element, NOTE_PATH)).toBe(false);
  });

  it('rejects a marked script with an onload attribute', () => {
    const src = expectedMermaidScriptSrc(NOTE_PATH, MERMAID_LIB_ROLE);
    const element = scriptElement(
      `<script defer onload="alert(1)" ${MERMAID_SCRIPT_ATTR}="${MERMAID_LIB_ROLE}" src="${src}"></script>`,
    );
    expect(isTrustedMermaidScript(element, NOTE_PATH)).toBe(false);
  });

  it('rejects a marked script whose src uses the wrong relative depth', () => {
    const element = scriptElement(
      `<script defer ${MERMAID_SCRIPT_ATTR}="${MERMAID_LIB_ROLE}" src="../../.gaveta/mermaid.min.js"></script>`,
    );
    expect(isTrustedMermaidScript(element, NOTE_PATH)).toBe(false);
    const wrongSrc = doc(
      '<article><pre class="mermaid">graph LR\n  A-->B</pre></article>',
      `<script defer ${MERMAID_SCRIPT_ATTR}="${MERMAID_LIB_ROLE}" src="../../.gaveta/mermaid.min.js"></script>`,
    );
    expect(validateNote(wrongSrc, { notePath: NOTE_PATH }).ok).toBe(false);
  });

  it('accepts only the exact gaveta-generated lib and boot tags', () => {
    const lib = scriptElement(trustedLibTag());
    const boot = scriptElement(
      `<script defer ${MERMAID_SCRIPT_ATTR}="${MERMAID_BOOT_ROLE}" src="${expectedMermaidScriptSrc(NOTE_PATH, MERMAID_BOOT_ROLE)}"></script>`,
    );
    expect(isTrustedMermaidScript(lib, NOTE_PATH)).toBe(true);
    expect(isTrustedMermaidScript(boot, NOTE_PATH)).toBe(true);
  });
});
