import { expect, it } from 'vitest';
import { GavetaError } from './errors.ts';
import {
  MIN_SUPPORTED_NODE,
  assertRuntimeSupported,
  isNodeVersionAtLeast,
  probeFts5,
  sqliteIndicatesMissingFts5,
} from './runtime.ts';

it('compares Node versions without a semver dependency', () => {
  expect(isNodeVersionAtLeast('22.18.0', '22.18.0')).toBe(true);
  expect(isNodeVersionAtLeast('22.18.1', '22.18.0')).toBe(true);
  expect(isNodeVersionAtLeast('22.17.9', '22.18.0')).toBe(false);
  expect(isNodeVersionAtLeast('23.0.0', '22.18.0')).toBe(true);
});

it('detects a missing FTS5 module from SQLite errors', () => {
  expect(sqliteIndicatesMissingFts5(new Error('no such module: fts5'))).toBe(true);
  expect(sqliteIndicatesMissingFts5(new Error('database disk image is malformed'))).toBe(false);
});

it('fails fast with E_RUNTIME_UNSUPPORTED when the probe is injected off', () => {
  try {
    assertRuntimeSupported({
      nodeVersion: '22.14.0',
      minimum: MIN_SUPPORTED_NODE,
      fts5: () => false,
    });
    throw new Error('expected throw');
  } catch (error) {
    expect(error).toBeInstanceOf(GavetaError);
    const gaveta = error as GavetaError;
    expect(gaveta.code).toBe('E_RUNTIME_UNSUPPORTED');
    expect(gaveta.message).toContain('22.14.0');
    expect(gaveta.message).toContain(MIN_SUPPORTED_NODE);
  }
});

it('accepts the current runtime when version and FTS5 pass', () => {
  assertRuntimeSupported({
    nodeVersion: process.versions.node,
    minimum: MIN_SUPPORTED_NODE,
    fts5: () => true,
  });
});

it('probes FTS5 on this Node build', () => {
  expect(probeFts5()).toBe(true);
});

it('throws a catalog GavetaError for unsupported runtimes', () => {
  try {
    assertRuntimeSupported({
      nodeVersion: '22.0.0',
      minimum: MIN_SUPPORTED_NODE,
      fts5: () => true,
    });
    throw new Error('expected throw');
  } catch (error) {
    expect(error).toBeInstanceOf(GavetaError);
    expect((error as GavetaError).code).toBe('E_RUNTIME_UNSUPPORTED');
  }
});
