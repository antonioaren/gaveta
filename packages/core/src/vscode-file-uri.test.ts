import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildVsCodeFileUri } from './vscode-file-uri.ts';

describe('buildVsCodeFileUri', () => {
  it('builds a vscode file URI from an absolute path', () => {
    const absolute = path.resolve('/tmp/vault/nota.html');
    const uri = buildVsCodeFileUri(absolute);
    expect(uri.startsWith('vscode://file/')).toBe(true);
    expect(uri).not.toContain('..');
    expect(decodeURI(uri)).toContain('nota.html');
  });

  it('rejects relative paths', () => {
    expect(() => buildVsCodeFileUri('nota.html')).toThrow();
  });

  it('percent-encodes spaces and hash in path segments', () => {
    const absolute = path.resolve('/tmp/vault/My Notes #1/nota.html');
    const uri = buildVsCodeFileUri(absolute);
    expect(uri.startsWith('vscode://file/')).toBe(true);
    expect(uri).not.toContain('#1');
    expect(uri).toContain('My%20Notes%20%231');
    expect(uri).toContain('/nota.html');
  });

  it('percent-encodes question mark and percent in path segments', () => {
    const absolute = path.resolve('/tmp/vault/what?/100%done.html');
    const uri = buildVsCodeFileUri(absolute);
    expect(uri).toContain('what%3F');
    expect(uri).toContain('100%25done.html');
    expect(uri).not.toContain('?');
  });

  it('percent-encodes non-ASCII characters in path segments', () => {
    const absolute = path.resolve('/tmp/vault/café/año.html');
    const uri = buildVsCodeFileUri(absolute);
    expect(uri).toContain('caf%C3%A9');
    expect(uri).toContain('a%C3%B1o.html');
  });

  it('keeps slashes and an unencoded Windows drive prefix', () => {
    const uri = buildVsCodeFileUri('C:/Users/me/My Notes #1/nota.html');
    expect(uri.startsWith('vscode://file/C:/')).toBe(true);
    expect(uri).toContain('My%20Notes%20%231');
    expect(uri).not.toContain('#1');
  });
});
