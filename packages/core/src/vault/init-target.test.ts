import { expect, it } from 'vitest';
import { GAVETA_VAULT_ENV } from './constants.ts';
import { resolveInitDirectory } from './init-target.ts';

it('prefers positional dir over --vault, GAVETA_VAULT, and cwd', () => {
  expect(
    resolveInitDirectory({
      positional: 'pos',
      vaultOption: 'opt',
      env: { [GAVETA_VAULT_ENV]: 'env' },
    }),
  ).toBe('pos');
  expect(
    resolveInitDirectory({
      vaultOption: 'opt',
      env: { [GAVETA_VAULT_ENV]: 'env' },
    }),
  ).toBe('opt');
  expect(resolveInitDirectory({ env: { [GAVETA_VAULT_ENV]: 'env' } })).toBe('env');
  expect(resolveInitDirectory({ env: {} })).toBeUndefined();
});

it('ignores an empty GAVETA_VAULT', () => {
  expect(resolveInitDirectory({ env: { [GAVETA_VAULT_ENV]: '' } })).toBeUndefined();
});
