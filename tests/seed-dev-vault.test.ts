import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { expect, it } from 'vitest';
import { SEED_NOTE_PATHS, seedDevVault } from './lib/seed-dev-vault.ts';

const REPO_ROOT = join(import.meta.dirname, '..');
const GAVETA_BIN = join(REPO_ROOT, 'packages/cli/bin/gaveta.js');

it('seedDevVault writes expected notes and passes validate', async () => {
  const parent = mkdtempSync(join(tmpdir(), 'gaveta-seed-test-'));
  try {
    await seedDevVault(parent);
    for (const relative of SEED_NOTE_PATHS) {
      expect(readFileSync(join(parent, relative), 'utf8').length).toBeGreaterThan(20);
    }
    const validate = spawnSync(
      process.execPath,
      [GAVETA_BIN, 'validate', '--json', '--vault', parent],
      { cwd: parent, encoding: 'utf8' },
    );
    expect(validate.status).toBe(0);
    const body = JSON.parse(validate.stdout) as { ok: boolean };
    expect(body.ok).toBe(true);
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});
