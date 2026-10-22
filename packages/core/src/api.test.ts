import { expect, it } from 'vitest';
import {
  GavetaError,
  allocateSlug,
  createDefaultVaultConfig,
  discoverVault,
  parseVaultConfig,
  readVaultConfig,
  readVaultText,
  resolveInsideVault,
  slugify,
  writeAtomic,
  writeVaultConfig,
  writeVaultText,
  INDEX_SCHEMA_VERSION,
  openVaultIndex,
  foldMatchKey,
} from './index.ts';

it('exports vault I/O and the shared slug helper from the package entry', () => {
  expect(typeof slugify).toBe('function');
  expect(typeof allocateSlug).toBe('function');
  expect(typeof discoverVault).toBe('function');
  expect(typeof resolveInsideVault).toBe('function');
  expect(typeof readVaultText).toBe('function');
  expect(typeof writeVaultText).toBe('function');
  expect(typeof writeAtomic).toBe('function');
  expect(typeof createDefaultVaultConfig).toBe('function');
  expect(typeof parseVaultConfig).toBe('function');
  expect(typeof readVaultConfig).toBe('function');
  expect(typeof writeVaultConfig).toBe('function');
  expect(GavetaError.prototype).toBeInstanceOf(Error);
  expect(typeof openVaultIndex).toBe('function');
  expect(typeof foldMatchKey).toBe('function');
  expect(INDEX_SCHEMA_VERSION).toBe(2);
});
