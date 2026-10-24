import { GavetaError } from '@gaveta/core';
import { expect, it } from 'vitest';
import { assertSafeImportRelativePath } from './safe-relative-path.ts';

it('accepts nested markdown paths', () => {
  expect(assertSafeImportRelativePath('docs/a/b.md')).toBe('docs/a/b.md');
});

it('rejects traversal and dot segments', () => {
  expect(() => assertSafeImportRelativePath('../evil.md')).toThrow(GavetaError);
  expect(() => assertSafeImportRelativePath('a/../b.md')).toThrow(GavetaError);
  expect(() => assertSafeImportRelativePath('.hidden/x.md')).toThrow(GavetaError);
});
