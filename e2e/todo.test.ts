import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';

const root = join(import.meta.dirname, '..');
const bin = join(root, 'packages/cli/bin/gaveta.js');

const TASK_NOTE = readFileSync(
  join(root, 'fixtures/vaults/backlinks/enlaces/mas/enlace-20.html'),
  'utf8',
);

function run(args: readonly string[], cwd: string): { stdout: string; status: number } {
  const result = spawnSync(process.execPath, [bin, ...args], {
    cwd,
    env: { ...process.env, GAVETA_VAULT: undefined },
    encoding: 'utf8',
  });
  return { stdout: result.stdout, status: result.status ?? 1 };
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
  mkdirSync(join(vault, 'enlaces', 'mas'), { recursive: true });
  writeFileSync(join(vault, 'enlaces/mas/enlace-20.html'), TASK_NOTE);
  return vault;
}

it('spawns todo add, check, and list against a fixture note', () => {
  const parent = mkdtempSync(join(tmpdir(), 'gaveta-e2e-todo-'));
  try {
    const vault = makeVault(parent);
    const added = run(
      ['todo', 'add', 'enlaces/mas/enlace-20.html', 'Nueva tarea e2e', '--json'],
      vault,
    );
    expect(added.status).toBe(0);
    expect(added.stdout).toContain('nueva-tarea-e2e');

    const checked = run(
      ['todo', 'check', 'enlaces/mas/enlace-20.html', 'revisar', '--json'],
      vault,
    );
    expect(checked.status).toBe(0);
    expect(checked.stdout).toContain('"checked": true');

    const listed = run(['todo', 'list', '--open', '--json'], vault);
    expect(listed.status).toBe(0);
    expect(listed.stdout).toContain('nueva-tarea-e2e');
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});
