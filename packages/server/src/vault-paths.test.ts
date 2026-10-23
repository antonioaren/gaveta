import { expect, it } from 'vitest';
import {
  isAtomicTempRelativePath,
  isGavetaInternalRelativePath,
  shouldIndexVaultRelativePath,
} from './vault-paths.ts';

it('ignores .gaveta indexer paths and atomic temp files', () => {
  expect(isGavetaInternalRelativePath('.gaveta/index.sqlite')).toBe(true);
  expect(isGavetaInternalRelativePath('notes/a.html')).toBe(false);
  expect(isAtomicTempRelativePath('notes/.nota.abc123.tmp')).toBe(true);
  expect(shouldIndexVaultRelativePath('notes/.nota.abc123.tmp')).toBe(false);
  expect(shouldIndexVaultRelativePath('.gaveta/theme.css')).toBe(false);
  expect(shouldIndexVaultRelativePath('a.html')).toBe(true);
});
