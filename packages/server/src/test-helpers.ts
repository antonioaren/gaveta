import { vaultPath } from '@gaveta/fixtures';
import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export async function withVaultCopy(run: (vaultRoot: string) => Promise<void>): Promise<void> {
  const parent = mkdtempSync(join(tmpdir(), 'gaveta-server-'));
  const vaultRoot = join(parent, 'vault');
  cpSync(vaultPath('backlinks'), vaultRoot, { recursive: true });
  try {
    await run(vaultRoot);
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
}
