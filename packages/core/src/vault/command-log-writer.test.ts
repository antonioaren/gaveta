import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createDefaultVaultConfig, writeVaultConfig } from './config.ts';
import { withTemp } from './fixture.ts';
import { GAVETA_DIRECTORY } from './constants.ts';
import {
  COMMAND_LOG_RELATIVE,
  appendCommandLogEntry,
  isCommandLogEnabled,
  readCommandLog,
} from './command-log.ts';

async function makeVault(parent: string, config: unknown): Promise<string> {
  const root = join(parent, 'vault');
  await mkdir(join(root, GAVETA_DIRECTORY), { recursive: true });
  await writeVaultConfig(root, config);
  return root;
}

describe('isCommandLogEnabled', () => {
  it('is false unless commandLog.enabled is true', () => {
    expect(isCommandLogEnabled(createDefaultVaultConfig())).toBe(false);
    expect(
      isCommandLogEnabled({ ...createDefaultVaultConfig(), commandLog: { enabled: false } }),
    ).toBe(false);
    expect(
      isCommandLogEnabled({ ...createDefaultVaultConfig(), commandLog: { enabled: true } }),
    ).toBe(true);
  });
});

describe('appendCommandLogEntry', () => {
  it('does not create a log file when logging is disabled', async () => {
    await withTemp(async (parent) => {
      const root = await makeVault(parent, createDefaultVaultConfig());
      const wrote = await appendCommandLogEntry(root, {
        ts: '2026-10-26T10:00:00.000Z',
        command: 'search',
        ok: true,
        durationMs: 12,
      });
      expect(wrote).toBe(false);
      await expect(readCommandLog(root)).resolves.toBeNull();
    });
  });

  it('appends one jsonl line when logging is enabled', async () => {
    await withTemp(async (parent) => {
      const root = await makeVault(parent, {
        ...createDefaultVaultConfig(),
        commandLog: { enabled: true },
      });
      const wrote = await appendCommandLogEntry(root, {
        ts: '2026-10-26T10:00:00.000Z',
        command: 'new',
        ok: true,
        durationMs: 40,
        outgoingLinks: 2,
      });
      expect(wrote).toBe(true);
      const entries = await readCommandLog(root);
      expect(entries).toEqual([
        {
          ts: '2026-10-26T10:00:00.000Z',
          command: 'new',
          ok: true,
          durationMs: 40,
          outgoingLinks: 2,
        },
      ]);
    });
  });

  it('never throws when the log file cannot be written', async () => {
    await withTemp(async (parent) => {
      const root = await makeVault(parent, {
        ...createDefaultVaultConfig(),
        commandLog: { enabled: true },
      });
      const logPath = join(root, COMMAND_LOG_RELATIVE);
      await writeFile(logPath, '', 'utf8');
      await chmod(logPath, 0o000);
      const wrote = await appendCommandLogEntry(root, {
        ts: '2026-10-26T10:00:00.000Z',
        command: 'validate',
        ok: true,
      });
      expect(wrote).toBe(false);
    });
  });

  it('rotates oversized logs and keeps the newest lines', async () => {
    await withTemp(async (parent) => {
      const root = await makeVault(parent, {
        ...createDefaultVaultConfig(),
        commandLog: { enabled: true },
      });
      const logPath = join(root, COMMAND_LOG_RELATIVE);
      const line = JSON.stringify({
        ts: '2026-10-26T09:00:00.000Z',
        command: 'search',
        ok: true,
      });
      const filler = `${line}\n`.repeat(4000);
      await writeFile(logPath, filler, 'utf8');
      const wrote = await appendCommandLogEntry(root, {
        ts: '2026-10-26T10:00:00.000Z',
        command: 'new',
        ok: true,
      });
      expect(wrote).toBe(true);
      const text = await readFile(logPath, 'utf8');
      expect(text.length).toBeLessThan(filler.length);
      const entries = await readCommandLog(root);
      expect(entries?.at(-1)).toMatchObject({ command: 'new', ok: true });
    });
  });
});
