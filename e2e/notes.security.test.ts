import { spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';

const root = join(import.meta.dirname, '..');
const bin = join(root, 'packages/cli/bin/gaveta.js');

function childEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  delete env.GAVETA_VAULT;
  return env;
}

function run(
  args: readonly string[],
  cwd: string,
  input?: string,
): { stdout: string; stderr: string; status: number } {
  const result = spawnSync(process.execPath, [bin, ...args], {
    cwd,
    env: childEnv(),
    encoding: 'utf8',
    input,
  });
  return { stdout: result.stdout, stderr: result.stderr, status: result.status ?? 1 };
}

function makeVault(parent: string): string {
  const vault = join(parent, 'vault');
  mkdirSync(join(vault, '.gaveta'), { recursive: true });
  writeFileSync(
    join(vault, '.gaveta', 'config.json'),
    `${JSON.stringify(
      {
        rel: {
          vocabulary: ['related', 'depends-on', 'part-of', 'supersedes', 'references'],
          strict: false,
        },
        remoteAllowlist: [],
      },
      null,
      2,
    )}\n`,
  );
  return vault;
}

it('does not write outside the vault from the binary', () => {
  const parent = mkdtempSync(join(tmpdir(), 'gaveta-e2e-notes-sec-'));
  try {
    const vault = makeVault(parent);
    const outside = join(parent, 'fuera');
    mkdirSync(outside);
    writeFileSync(join(outside, 'secreto.txt'), 'secreto');
    const escaped = run(['new', 'Fuera', '--type', 'doc', '--in', '../fuera', '--json'], vault);
    expect(escaped.status).toBe(1);
    expect(escaped.stderr).toBe('');
    expect(JSON.parse(escaped.stdout)).toMatchObject({
      ok: false,
      command: 'new',
      error: { code: 'E_PATH_OUTSIDE_VAULT' },
    });
    symlinkSync(outside, join(vault, 'escape'), 'dir');
    const linked = run(['new', 'Fuga', '--type', 'doc', '--in', 'escape', '--json'], vault);
    expect(linked.status).toBe(1);
    expect(JSON.parse(linked.stdout)).toMatchObject({ error: { code: 'E_PATH_OUTSIDE_VAULT' } });
    expect(readFileSync(join(outside, 'secreto.txt'), 'utf8')).toBe('secreto');
    expect(readdirSync(outside)).toEqual(['secreto.txt']);

    const hostile = run(
      ['new', 'Hostil', '--type', 'doc', '--from', '-', '--json'],
      vault,
      '<article><h1>Hostil</h1><script>alert(1)</script><p onclick="evil()">texto seguro</p></article>',
    );
    expect(hostile.status).toBe(0);
    const html = readFileSync(join(vault, 'hostil.html'), 'utf8');
    expect(html.includes('<script')).toBe(false);
    expect(html.includes('onclick')).toBe(false);
    expect(html.includes('texto seguro')).toBe(true);
    expect(readdirSync(vault, { recursive: true }).join('\n').includes('.tmp')).toBe(false);
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});
