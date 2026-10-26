import { cp, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { EXIT_CODES, GAVETA_DIRECTORY } from '@gaveta/core';
import { vaultPath } from '@gaveta/fixtures';
import { expect, it } from 'vitest';
import { runCli } from '../run.ts';

function capture() {
  let stdout = '';
  let stderr = '';
  return {
    io: {
      stdout(chunk: string) {
        stdout += chunk;
      },
      stderr(chunk: string) {
        stderr += chunk;
      },
    },
    stdout: () => stdout,
    stderr: () => stderr,
  };
}

it('prints JSON stats for the vault index and optional log', async () => {
  const parent = await mkdtemp(join(tmpdir(), 'gaveta-cli-stats-'));
  const root = join(parent, 'problems');
  await cp(vaultPath('problems'), root, { recursive: true });
  try {
    const run = capture();
    expect(await runCli(['node', 'gaveta', 'stats', '--json'], { ...run.io, cwd: root })).toBe(
      EXIT_CODES.ok,
    );
    const body = JSON.parse(run.stdout()) as {
      ok: boolean;
      data: { index: { brokenLinks: number; orphanNotes: number }; log: { present: boolean } };
    };
    expect(body.ok).toBe(true);
    expect(body.data.index.brokenLinks).toBe(1);
    expect(body.data.index.orphanNotes).toBe(1);
    expect(body.data.log.present).toBe(false);

    await writeFile(
      join(root, GAVETA_DIRECTORY, 'log.jsonl'),
      `${JSON.stringify({ ts: '2026-10-26T10:00:00.000Z', command: 'new', ok: true, durationMs: 12 })}\n`,
      'utf8',
    );
    const again = capture();
    expect(await runCli(['node', 'gaveta', 'stats', '--json'], { ...again.io, cwd: root })).toBe(
      EXIT_CODES.ok,
    );
    const withLog = JSON.parse(again.stdout()) as {
      data: { log: { present: boolean; commandEntries: number } };
    };
    expect(withLog.data.log).toMatchObject({ present: true, commandEntries: 1 });
    expect(again.stderr()).toBe('');
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});
