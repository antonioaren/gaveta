import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { childEnv, initVault, parseJson, runGaveta } from './helpers.ts';

function enableCommandLog(vault: string): void {
  const configPath = join(vault, '.gaveta/config.json');
  const config = JSON.parse(readFileSync(configPath, 'utf8')) as Record<string, unknown>;
  writeFileSync(
    configPath,
    `${JSON.stringify({ ...config, commandLog: { enabled: true } }, null, 2)}\n`,
    'utf8',
  );
}

it('REQ-CLI-15: enabled command log records CLI activity for gaveta stats', () => {
  const parent = mkdtempSync(join(tmpdir(), 'gaveta-e2e-command-log-'));
  const vault = join(parent, 'vault');
  mkdirSync(vault);
  try {
    initVault(vault);
    enableCommandLog(vault);

    const search = runGaveta(['search', 'enlace', '--json'], { cwd: vault });
    expect(search.status).toBe(0);

    const validate = runGaveta(['validate', '--json'], { cwd: vault });
    expect(validate.status).toBe(0);

    const stats = runGaveta(['stats', '--json'], { cwd: vault });
    expect(stats.status).toBe(0);
    const body = parseJson<{ log: { present: boolean; commandEntries: number } }>(stats.stdout);
    expect(body.data.log.present).toBe(true);
    expect(body.data.log.commandEntries).toBe(2);

    const logText = readFileSync(join(vault, '.gaveta/log.jsonl'), 'utf8');
    expect(logText).toContain('"command":"search"');
    expect(logText).toContain('"command":"validate"');
    expect(logText).not.toContain('"command":"stats"');
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

it('REQ-CLI-15: command log stays off unless config enables it', () => {
  const parent = mkdtempSync(join(tmpdir(), 'gaveta-e2e-command-log-off-'));
  const vault = join(parent, 'vault');
  mkdirSync(vault);
  try {
    initVault(vault);
    runGaveta(['search', 'x', '--json'], { cwd: vault });
    expect(() => readFileSync(join(vault, '.gaveta/log.jsonl'), 'utf8')).toThrow();
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

it('REQ-CLI-15: localized stats mentions how to enable the log', () => {
  const parent = mkdtempSync(join(tmpdir(), 'gaveta-e2e-command-log-hint-'));
  const vault = join(parent, 'vault');
  mkdirSync(vault);
  try {
    initVault(vault);
    const en = runGaveta(['stats'], { cwd: vault, env: childEnv({ GAVETA_LANG: 'en' }) });
    expect(en.stdout).toContain('commandLog');

    const es = runGaveta(['stats'], { cwd: vault, env: childEnv({ GAVETA_LANG: 'es' }) });
    expect(es.stdout).toContain('commandLog');
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});
