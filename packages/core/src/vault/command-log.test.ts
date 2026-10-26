import { mkdir, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createDefaultVaultConfig, writeVaultConfig } from '../index.ts';
import { withTemp } from './fixture.ts';
import { GAVETA_DIRECTORY } from './constants.ts';
import { COMMAND_LOG_RELATIVE, readCommandLog } from './command-log.ts';

async function makeVault(parent: string): Promise<string> {
  const root = join(parent, 'vault');
  await mkdir(join(root, GAVETA_DIRECTORY), { recursive: true });
  await writeVaultConfig(root, createDefaultVaultConfig());
  return root;
}

describe('readCommandLog', () => {
  it('returns null when the log file is missing', async () => {
    await withTemp(async (parent) => {
      const root = await makeVault(parent);
      await expect(readCommandLog(root)).resolves.toBeNull();
    });
  });

  it('parses valid jsonl lines and skips invalid ones', async () => {
    await withTemp(async (parent) => {
      const root = await makeVault(parent);
      const logPath = join(root, COMMAND_LOG_RELATIVE);
      await writeFile(
        logPath,
        [
          JSON.stringify({ ts: '2026-10-26T10:00:00.000Z', command: 'new', ok: true }),
          '{not json}',
          JSON.stringify({ ts: '2026-10-26T10:01:00.000Z', command: 'read', ok: false }),
        ].join('\n') + '\n',
        'utf8',
      );
      const entries = await readCommandLog(root);
      expect(entries).toEqual([
        { ts: '2026-10-26T10:00:00.000Z', command: 'new', ok: true },
        { ts: '2026-10-26T10:01:00.000Z', command: 'read', ok: false },
      ]);
    });
  });

  it('rejects a symlinked log file', async () => {
    await withTemp(async (parent) => {
      const root = await makeVault(parent);
      const outside = join(parent, 'outside.jsonl');
      await writeFile(
        outside,
        '{"ts":"2026-10-26T10:00:00.000Z","command":"new","ok":true}\n',
        'utf8',
      );
      await symlink(outside, join(root, COMMAND_LOG_RELATIVE));
      await expect(readCommandLog(root)).rejects.toMatchObject({
        code: 'E_PATH_OUTSIDE_VAULT',
      });
    });
  });
});
