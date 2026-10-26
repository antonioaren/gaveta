import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { vaultPath } from '@gaveta/fixtures';
import { expect, it } from 'vitest';
import { childEnv, initVault, parseJson, runGaveta } from './helpers.ts';

it('REQ-CLI-15: gaveta stats reports index metrics and optional log.jsonl', () => {
  const parent = mkdtempSync(join(tmpdir(), 'gaveta-e2e-stats-'));
  const vault = join(parent, 'vault');
  cpSync(vaultPath('problems'), vault, { recursive: true });
  try {
    const result = runGaveta(['stats', '--json'], { cwd: vault });
    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    const body = parseJson(result.stdout);
    expect(body).toMatchObject({
      ok: true,
      command: 'stats',
      data: {
        index: {
          brokenLinks: 1,
          orphanNotes: 1,
          pendingLinks: 1,
        },
        log: { present: false },
      },
    });

    mkdirSync(join(vault, '.gaveta'), { recursive: true });
    writeFileSync(
      join(vault, '.gaveta/log.jsonl'),
      `${JSON.stringify({
        ts: '2026-10-26T10:00:00.000Z',
        command: 'new',
        ok: true,
        durationMs: 25,
        outgoingLinks: 2,
      })}\n`,
      'utf8',
    );
    const withLog = runGaveta(['stats', '--json'], { cwd: vault });
    expect(withLog.status).toBe(0);
    const logged = parseJson<{ log: { present: boolean; commandEntries: number } }>(withLog.stdout);
    expect(logged.data.log).toMatchObject({
      present: true,
      commandEntries: 1,
      commandSuccessRate: 1,
      averageOutgoingLinksPerNoteCreated: 2,
    });
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

it('REQ-CLI-15: human output is localized', () => {
  const parent = mkdtempSync(join(tmpdir(), 'gaveta-e2e-stats-human-'));
  const vault = join(parent, 'vault');
  mkdirSync(vault);
  try {
    initVault(vault);
    const es = runGaveta(['stats'], { cwd: vault, env: childEnv({ GAVETA_LANG: 'es' }) });
    expect(es.status).toBe(0);
    expect(es.stdout).toContain('notas');

    const en = runGaveta(['stats'], { cwd: vault, env: childEnv({ GAVETA_LANG: 'en' }) });
    expect(en.status).toBe(0);
    expect(en.stdout).toContain('notes');
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});
