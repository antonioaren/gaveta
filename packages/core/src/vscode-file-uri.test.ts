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
});
