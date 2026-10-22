import { describe, expect, it } from 'vitest';
import {
  ARTIFACT_CSP_OFFLINE,
  buildArtifactBody,
  escapeSrcdoc,
  injectArtifactCsp,
  readArtifactSrcdoc,
  srcdocContainsCsp,
} from './artifact.ts';
import { validateNote } from './validate.ts';

const NOTE_ID = '01JB7Z3K9QX4T5M2N8V6R0WYHC';
const CREATED = '2026-10-22T00:00:00.000Z';

function shell(body: string, cdn = false): string {
  const cdnMeta = cdn ? '<meta name="gaveta:artifact-cdn" content="true">' : '';
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Demo</title><meta name="gaveta:id" content="${NOTE_ID}"><meta name="gaveta:type" content="artifact"><meta name="gaveta:created" content="${CREATED}">${cdnMeta}</head><body>${body}</body></html>`;
}

function artifactSrcdocFromBody(body: string): string {
  const srcdoc = readArtifactSrcdoc(shell(body));
  if (srcdoc === null) {
    throw new Error('expected artifact srcdoc');
  }
  return srcdoc;
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

  it('attribute-escapes iframe title against quoting breakouts', () => {
    const malicious = '"><img onerror=alert(1) src=x>';
    const body = buildArtifactBody({
      title: malicious,
      description: 'Prueba',
      originalHtml: '<p>Hola</p>',
      allowCdn: false,
    });
    expect(body).toContain('title="&quot;&gt;&lt;img onerror=alert(1) src=x&gt;"');
    expect(body).not.toMatch(/title=""><img/);
    expect(validateNote(shell(body)).ok).toBe(true);
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

  it('places CSP meta as the first element in head even when a script precedes it in source', () => {
    const source = `<!doctype html><html><head><script>alert(1)</script><meta charset="utf-8"></head><body></body></html>`;
    const injected = injectArtifactCsp(source, ARTIFACT_CSP_OFFLINE);
    expect(srcdocContainsCsp(injected, ARTIFACT_CSP_OFFLINE)).toBe(true);
    const tampered = injected.replace(
      '<meta http-equiv="Content-Security-Policy"',
      '<script>bad()</script><meta http-equiv="Content-Security-Policy"',
    );
    expect(srcdocContainsCsp(tampered, ARTIFACT_CSP_OFFLINE)).toBe(false);
    const body = buildArtifactBody({
      title: 'Demo',
      description: 'Prueba',
      originalHtml: source,
      allowCdn: false,
    });
    expect(validateNote(shell(body)).ok).toBe(true);
  });

  it('does not treat body header as document head', () => {
    const source =
      '<!doctype html><html><body><header><h1>Título</h1></header><p>Hola</p></body></html>';
    const injected = injectArtifactCsp(source, ARTIFACT_CSP_OFFLINE);
    expect(injected.toLowerCase()).toContain('<head>');
    expect(injected.toLowerCase()).not.toContain(
      '<header><meta http-equiv="content-security-policy"',
    );
    expect(srcdocContainsCsp(injected, ARTIFACT_CSP_OFFLINE)).toBe(true);
  });

  it('injects CSP when head is not closed before body', () => {
    const source =
      '<!doctype html><html><head><meta charset="utf-8"><body><p>Hola</p></body></html>';
    const injected = injectArtifactCsp(source, ARTIFACT_CSP_OFFLINE);
    expect(srcdocContainsCsp(injected, ARTIFACT_CSP_OFFLINE)).toBe(true);
  });

  it('rejects a second permissive CSP meta in srcdoc', () => {
    const body = buildArtifactBody({
      title: 'Demo',
      description: 'Prueba',
      originalHtml: '<p>Hola</p>',
      allowCdn: false,
    });
    const srcdoc = artifactSrcdocFromBody(body);
    const loose = "default-src *; script-src * 'unsafe-inline' 'unsafe-eval'";
    const tampered = srcdoc.replace(
      '</head>',
      `<meta http-equiv="Content-Security-Policy" content="${loose}"></head>`,
    );
    const tamperedBody = body.replace(escapeSrcdoc(srcdoc), escapeSrcdoc(tampered));
    const result = validateNote(shell(tamperedBody));
    expect(result.ok).toBe(false);
    expect(result.diagnostics.some((d) => d.code === 'E_ARTIFACT_CSP')).toBe(true);
  });

  it('rejects meta refresh inside srcdoc', () => {
    const body = buildArtifactBody({
      title: 'Demo',
      description: 'Prueba',
      originalHtml: '<p>Hola</p>',
      allowCdn: false,
    });
    const srcdoc = artifactSrcdocFromBody(body);
    const tampered = srcdoc.replace(
      '</head>',
      '<meta http-equiv="refresh" content="0;url=https://evil.test"></head>',
    );
    const tamperedBody = body.replace(escapeSrcdoc(srcdoc), escapeSrcdoc(tampered));
    const result = validateNote(shell(tamperedBody));
    expect(result.ok).toBe(false);
    expect(result.diagnostics.some((d) => d.code === 'E_ARTIFACT_CSP')).toBe(true);
  });

  it('handles uppercase and mixed-case head tags', () => {
    const source =
      '<!DOCTYPE HTML><HTML><HeAd><META charset="utf-8"></HeAd><BODY><p>Hola</p></BODY></HTML>';
    const injected = injectArtifactCsp(source, ARTIFACT_CSP_OFFLINE);
    expect(srcdocContainsCsp(injected, ARTIFACT_CSP_OFFLINE)).toBe(true);
    const body = buildArtifactBody({
      title: 'Demo',
      description: 'Prueba',
      originalHtml: source,
      allowCdn: false,
    });
    expect(validateNote(shell(body)).ok).toBe(true);
  });
});
