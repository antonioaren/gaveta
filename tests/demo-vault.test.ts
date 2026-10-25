import { join } from 'node:path';
import { doctorVault } from '@gaveta/core';
import { expect, it } from 'vitest';
import { DEMO_VAULT_RELATIVE } from '../scripts/bootstrap-demo-vault.ts';

const DEMO_VAULT = join(import.meta.dirname, '..', DEMO_VAULT_RELATIVE);

it('examples/demo-vault passes gaveta doctor with zero findings', async () => {
  const report = await doctorVault(DEMO_VAULT);
  expect(report.ok).toBe(true);
  expect(report.findings).toEqual([]);
});
