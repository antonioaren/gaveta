import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BACKLINK_COUNT, NOTE_X, linkerSpec, vaultPath } from '@gaveta/fixtures';
import { doctorVault, relativeNoteHref } from '@gaveta/core';
import { expect, it } from 'vitest';

const root = join(import.meta.dirname, '..');
const bin = join(root, 'packages/cli/bin/gaveta.js');

interface RunResult {
  stdout: string;
  stderr: string;
  status: number;
}

function childEnv(vault: string): NodeJS.ProcessEnv {
  return { ...process.env, GAVETA_VAULT: vault };
}

function run(args: readonly string[], vault: string): RunResult {
  const result = spawnSync(process.execPath, [bin, ...args], {
    cwd: vault,
    env: childEnv(vault),
    encoding: 'utf8',
  });
  return {
    stdout: result.stdout,
    stderr: result.stderr,
    status: result.status ?? 1,
  };
}

function copyBacklinksVault(parent: string): string {
  const vault = join(parent, 'backlinks');
  cpSync(vaultPath('backlinks'), vault, { recursive: true });
  return vault;
}

it('mv from the binary rewrites twenty hrefs and doctor reports zero broken links', async () => {
  const parent = mkdtempSync(join(tmpdir(), 'gaveta-e2e-mv-'));
  try {
    const vault = copyBacklinksVault(parent);
    const before = new Map<string, string>();
    for (let index = 1; index <= BACKLINK_COUNT; index += 1) {
      const spec = linkerSpec(index);
      before.set(spec.path, readFileSync(join(vault, spec.path), 'utf8'));
    }

    const moved = run(['mv', 'Nota X', 'otra/ruta', '--json'], vault);
    expect(moved.status).toBe(0);
    expect(moved.stderr).toBe('');
    const body = JSON.parse(moved.stdout) as { data: { to: string; rewritten: string[] } };
    expect(body.data.to).toBe('otra/ruta.html');
    expect(body.data.rewritten).toHaveLength(BACKLINK_COUNT);

    for (let position = 1; position <= BACKLINK_COUNT; position += 1) {
      const spec = linkerSpec(position);
      const previous = before.get(spec.path);
      const href = relativeNoteHref(spec.path, 'otra/ruta.html');
      expect(previous).toBeTypeOf('string');
      expect(href).toBeTypeOf('string');
      if (previous === undefined || href === null) {
        return;
      }
      const html = readFileSync(join(vault, spec.path), 'utf8');
      const needle = position <= 10 ? 'href="../nota-x.html"' : 'href="../../nota-x.html"';
      expect(html).toBe(previous.replace(needle, `href="${href}"`));
    }

    const report = await doctorVault(vault);
    expect(report.findings.filter((finding) => finding.code === 'E_LINK_BROKEN')).toHaveLength(0);
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

it('rm --force from the binary leaves pending links, not broken ones', async () => {
  const parent = mkdtempSync(join(tmpdir(), 'gaveta-e2e-rm-'));
  try {
    const vault = copyBacklinksVault(parent);
    const removed = run(['rm', NOTE_X.path, '--force', '--json'], vault);
    expect(removed.status).toBe(0);
    expect(removed.stderr).toBe('');

    const report = await doctorVault(vault);
    expect(report.findings.filter((finding) => finding.code === 'E_LINK_BROKEN')).toHaveLength(0);
    expect(
      report.findings.filter((finding) => finding.code === 'W_LINK_PENDING').length,
    ).toBeGreaterThan(0);
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});
