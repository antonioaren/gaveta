import { EXIT_CODES } from '@gaveta/core';
import { expect, it } from 'vitest';
import { parseJson, runGaveta } from './helpers.ts';

it('reports install metadata in version --json', () => {
  const version = runGaveta(['version', '--json']);
  expect(version.status).toBe(0);
  const payload = parseJson<{ version: string; install: { method: string; git: unknown } }>(
    version.stdout,
  );
  expect(payload.data.version).toMatch(/^\d+\.\d+\.\d+$/);
  expect(payload.data.install.method).toBe('git');
  expect(payload.data.install.git).not.toBeNull();
});

it('runs update --check on a clean main checkout or refuses a dirty tree', () => {
  const check = runGaveta(['update', '--check', '--json', '--channel', 'main']);
  if (check.status === EXIT_CODES.ok) {
    const payload = parseJson<{ upToDate: boolean }>(check.stdout);
    expect(payload.data.upToDate).toBe(true);
    return;
  }
  expect(check.status).toBe(EXIT_CODES.conflict);
  const payload = parseJson<{ error: { code: string } }>(check.stdout);
  expect(['E_UPDATE_DIRTY', 'E_UPDATE_BRANCH']).toContain(payload.error?.code);
});
