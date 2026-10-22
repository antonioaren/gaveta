import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DUPLICATE_ID, GHOST_TITLE, MISSING_ID } from '../fixtures/src/catalog.ts';
import { expect, it } from 'vitest';

const root = join(import.meta.dirname, '..');
const bin = join(root, 'packages/cli/bin/gaveta.js');

interface RunResult {
  stdout: string;
  stderr: string;
  status: number;
}

function run(args: readonly string[], cwd: string): RunResult {
  const result = spawnSync(process.execPath, [bin, ...args], {
    cwd,
    env: { ...process.env, GAVETA_VAULT: undefined },
    encoding: 'utf8',
  });
  return {
    stdout: result.stdout,
    stderr: result.stderr,
    status: result.status ?? 1,
  };
}

function withFixture(name: 'problems' | 'malicious' | 'empty', run: (dir: string) => void): void {
  const parent = mkdtempSync(join(tmpdir(), 'gaveta-e2e-health-'));
  const vault = join(parent, name);
  try {
    cpSync(join(root, 'fixtures/vaults', name), vault, { recursive: true });
    run(vault);
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
}

function countCode(findings: readonly { code: string }[], code: string): number {
  return findings.filter((finding) => finding.code === code).length;
}

it('validate exits non-zero on malicious notes and zero on empty vault', () => {
  withFixture('malicious', (vault) => {
    const bad = run(['validate', '--json'], vault);
    expect(bad.status).not.toBe(0);
    expect(bad.stdout).toContain('E_UNSAFE_SCRIPT');
  });
  withFixture('empty', (vault) => {
    const ok = run(['validate', '--json'], vault);
    expect(ok.status).toBe(0);
    const emptyBody = JSON.parse(ok.stdout) as { data: { ok: boolean } };
    expect(emptyBody.data.ok).toBe(true);
  });
});

it('doctor reports one finding per problem type and --fix repairs deterministic issues', () => {
  withFixture('problems', (vault) => {
    const report = run(['doctor', '--json'], vault);
    expect(report.status).not.toBe(0);
    const findings = (JSON.parse(report.stdout) as { data: { findings: { code: string }[] } }).data
      .findings;
    expect(countCode(findings, 'E_LINK_BROKEN')).toBe(1);
    expect(countCode(findings, 'W_LINK_PENDING')).toBe(1);
    expect(countCode(findings, 'W_NOTE_ORPHAN')).toBe(1);
    expect(countCode(findings, 'E_ID_DUPLICATE')).toBe(1);
    expect(countCode(findings, 'E_TASK_INVALID')).toBe(1);
    expect(countCode(findings, 'W_LINK_HREF_STALE')).toBe(1);
    expect(countCode(findings, 'W_THEME_HREF')).toBe(1);
    const broken = findings.find((finding) => finding.code === 'E_LINK_BROKEN');
    expect(broken).toMatchObject({
      path: 'nota-rota.html',
      details: { targetId: MISSING_ID },
    });
    const pending = findings.find((finding) => finding.code === 'W_LINK_PENDING');
    expect(pending).toMatchObject({ details: { title: GHOST_TITLE } });
    const duplicate = findings.find((finding) => finding.code === 'E_ID_DUPLICATE');
    expect(duplicate).toMatchObject({ details: { id: DUPLICATE_ID } });

    const fixed = run(['doctor', '--fix', '--json'], vault);
    expect(fixed.status).not.toBe(0);
    const body = JSON.parse(fixed.stdout) as { data: { fixed: { path: string }[] } };
    expect(body.data.fixed.map((item) => item.path).sort()).toEqual([
      'anidada/ruta-del-tema.html',
      'href-desfasado.html',
    ]);
    expect(readFileSync(join(vault, 'href-desfasado.html'), 'utf8')).toContain(
      'href="nota-destino.html"',
    );
  });
});

it('reindex rebuilds the index after the cache file is removed', () => {
  withFixture('problems', (vault) => {
    const first = run(['reindex', '--json'], vault);
    expect(first.status).toBe(0);
    unlinkSync(join(vault, '.gaveta', 'index.sqlite'));
    const second = run(['reindex', '--full', '--json'], vault);
    expect(second.status).toBe(0);
    const data = JSON.parse(second.stdout) as { data: { written: number; mode: string } };
    expect(data.data.mode).toBe('full');
    expect(data.data.written).toBeGreaterThan(0);
    const search = run(['search', '--json', 'destino'], vault);
    expect(search.status).toBe(0);
    expect(search.stdout).toContain('nota-destino.html');
  });
});
