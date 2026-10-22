import { describe, expect, it } from 'vitest';
import { buildArtifactBody, escapeSrcdoc } from './artifact.ts';
import { validateNote } from './validate.ts';

const NOTE_ID = '01JB7Z3K9QX4T5M2N8V6R0WYHC';
const CREATED = '2026-10-22T00:00:00.000Z';

function shell(body: string, cdn = false): string {
  const cdnMeta = cdn ? '<meta name="gaveta:artifact-cdn" content="true">' : '';
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Demo</title><meta name="gaveta:id" content="${NOTE_ID}"><meta name="gaveta:type" content="artifact"><meta name="gaveta:created" content="${CREATED}">${cdnMeta}</head><body>${body}</body></html>`;
}

describe('artifact security', () => {
  it('rejects sandbox escape attempts in srcdoc', () => {
    const breakout = `<script>alert(1)</script></iframe><script>alert(2)</script>`;
    const body = buildArtifactBody({
      title: 'Demo',
      description: 'Prueba',
      originalHtml: breakout,
      allowCdn: false,
    });
    expect(validateNote(shell(body)).ok).toBe(true);
    expect(body.toLowerCase()).not.toContain('</iframe><script');
  });

  it('entity-encodes srcdoc quotes', () => {
    const encoded = escapeSrcdoc('"><img onerror=alert(1) src=x>');
    expect(encoded).not.toContain('">');
    expect(encoded).toContain('&quot;');
  });

  it('rejects tampered sandbox flags', () => {
    const body = buildArtifactBody({
      title: 'Demo',
      description: 'Prueba',
      originalHtml: '<p>Hola</p>',
      allowCdn: false,
    }).replace('sandbox="allow-scripts"', 'sandbox="allow-scripts allow-same-origin"');
    const result = validateNote(shell(body));
    expect(result.ok).toBe(false);
    expect(result.diagnostics.some((d) => d.code === 'E_ARTIFACT_SANDBOX')).toBe(true);
  });

  it('rejects javascript: meta refresh inside outer note', () => {
    const body = `${buildArtifactBody({
      title: 'Demo',
      description: 'Prueba',
      originalHtml: '<p>Seguro</p>',
      allowCdn: false,
    })}<meta http-equiv="refresh" content="0;url=javascript:alert(1)">`;
    const result = validateNote(shell(body));
    expect(result.ok).toBe(false);
  });

  it('rejects a second iframe', () => {
    const base = buildArtifactBody({
      title: 'Demo',
      description: 'Prueba',
      originalHtml: '<p>Uno</p>',
      allowCdn: false,
    });
    const body = base.replace('</article>', '<iframe srcdoc="<p>x</p>"></iframe></article>');
    const result = validateNote(shell(body));
    expect(result.ok).toBe(false);
    expect(result.diagnostics.some((d) => d.code === 'E_ARTIFACT_IFRAME')).toBe(true);
  });
});
