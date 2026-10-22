import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { expect, it } from 'vitest';

const root = join(import.meta.dirname, '..');
const bin = join(root, 'packages/cli/bin/gaveta.js');

interface RunResult {
  stdout: string;
  stderr: string;
  status: number;
}

function run(
  args: readonly string[],
  options: { cwd?: string; env?: NodeJS.ProcessEnv } = {},
): RunResult {
  const env: NodeJS.ProcessEnv = { ...process.env };
  delete env.GAVETA_VAULT;
  const result = spawnSync(process.execPath, [bin, ...args], {
    cwd: options.cwd,
    env: options.env ?? env,
    encoding: 'utf8',
  });
  return {
    stdout: result.stdout,
    stderr: result.stderr,
    status: result.status ?? 1,
  };
}

it('initializes at --vault or GAVETA_VAULT when no positional dir is given', () => {
  const parent = mkdtempSync(join(tmpdir(), 'gaveta-e2e-init-target-'));
  const cwd = join(parent, 'cwd');
  const byOption = join(parent, 'by-option');
  const byEnv = join(parent, 'by-env');
  mkdirSync(cwd);
  try {
    const option = run(['init', '--json', '--vault', byOption], { cwd });
    expect(option.status).toBe(0);
    expect(option.stderr).toBe('');
    expect(JSON.parse(option.stdout)).toMatchObject({
      data: { root: realpathSync(byOption) },
    });

    const fromEnv = run(['init', '--json'], {
      cwd,
      env: { ...process.env, GAVETA_VAULT: byEnv },
    });
    expect(fromEnv.status).toBe(0);
    expect(fromEnv.stderr).toBe('');
    expect(JSON.parse(fromEnv.stdout)).toMatchObject({
      data: { root: realpathSync(byEnv) },
    });
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

it('initializes a vault from the binary and stays idempotent', () => {
  const parent = mkdtempSync(join(tmpdir(), 'gaveta-e2e-init-'));
  const directory = join(parent, 'vault');
  mkdirSync(directory);
  const html = '<html><script>alert(1)</script><p>Hola</p></html>';
  writeFileSync(join(directory, 'keep.html'), html);
  try {
    const created = run(['init', '--json'], { cwd: directory });
    expect(created.status).toBe(0);
    expect(created.stderr).toBe('');
    const body = JSON.parse(created.stdout) as {
      ok: boolean;
      schemaVersion: number;
      command: string;
      data: { root: string; created: string[]; preserved: string[]; agentInstructions: null };
    };
    expect(body).toMatchObject({
      ok: true,
      schemaVersion: 1,
      command: 'init',
      data: {
        root: realpathSync(directory),
        created: ['.gaveta/config.json', '.gaveta/theme.css', '.gaveta/index.sqlite'],
        preserved: [],
        agentInstructions: null,
      },
    });
    expect(readFileSync(join(directory, 'keep.html'), 'utf8')).toBe(html);
    expect(readFileSync(join(directory, '.gaveta/index.sqlite')).length).toBeGreaterThan(0);

    const help = run(['init', '--help'], { cwd: directory });
    expect(help.status).toBe(0);
    expect(help.stdout).toContain('--agent-instructions');
    expect(help.stdout).toContain('CLAUDE.md');
    expect(help.stdout).not.toContain('Usage:');

    const bytes = readFileSync(join(directory, '.gaveta/config.json'));
    const again = run(['init', '--json'], { cwd: directory });
    expect(again.status).toBe(0);
    expect(JSON.parse(again.stdout)).toMatchObject({
      data: {
        created: [],
        preserved: ['.gaveta/config.json', '.gaveta/theme.css', '.gaveta/index.sqlite'],
      },
    });
    expect(readFileSync(join(directory, '.gaveta/config.json'))).toEqual(bytes);
    expect(readFileSync(join(directory, 'keep.html'), 'utf8')).toBe(html);
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

it('writes one agent block and adopts hostile HTML into the index', () => {
  const parent = mkdtempSync(join(tmpdir(), 'gaveta-e2e-adopt-'));
  const directory = join(parent, 'vault');
  mkdirSync(directory);
  const secret = join(parent, 'secret.html');
  writeFileSync(secret, '<p>secret</p>');
  symlinkSync(secret, join(directory, 'leak.html'));
  const hostile = [
    '<html><head><title>Ataque</title></head><body><article>',
    '<h1>Ataque</h1>',
    '<script>alert(1)</script>',
    '<p onclick="alert(2)" style="color:red">Visible</p>',
    '<a href="javascript:alert(3)">pulsa</a>',
    '</article></body></html>',
  ].join('');
  writeFileSync(join(directory, 'nota.html'), hostile);
  writeFileSync(join(directory, 'otro.html'), 'no tocar');
  try {
    const instructions = run(['init', '--agent-instructions', 'claude', '--json'], {
      cwd: directory,
    });
    expect(instructions.status).toBe(0);
    expect(instructions.stderr).toBe('');
    const claude = readFileSync(join(directory, 'CLAUDE.md'), 'utf8');
    expect(claude).toContain('<!-- gaveta:start -->');
    expect(claude).toContain('<!-- gaveta:end -->');
    expect(claude.indexOf('<!-- gaveta:start -->')).toBe(
      claude.lastIndexOf('<!-- gaveta:start -->'),
    );
    const repeat = run(['init', '--agent-instructions', 'claude'], { cwd: directory });
    expect(repeat.status).toBe(0);
    expect(readFileSync(join(directory, 'CLAUDE.md'), 'utf8')).toBe(claude);

    const rejected = run(['init', '--agent-instructions', 'all', '--json'], { cwd: directory });
    expect(rejected.status).toBe(1);
    expect(JSON.parse(rejected.stdout)).toMatchObject({
      ok: false,
      schemaVersion: 1,
      error: { code: 'E_ARG_INVALID' },
    });

    const adopted = run(['adopt', 'nota.html', '--json'], { cwd: directory });
    expect(adopted.status).toBe(0);
    expect(adopted.stderr).toBe('');
    const body = JSON.parse(adopted.stdout) as {
      ok: boolean;
      schemaVersion: number;
      command: string;
      data: { id: string; path: string; hash: string; title: string };
      warnings: { code: string }[];
    };
    expect(body.ok).toBe(true);
    expect(body.schemaVersion).toBe(1);
    expect(body.command).toBe('adopt');
    expect(body.data).toMatchObject({ path: 'nota.html', title: 'Ataque' });
    expect(body.warnings.map((warning) => warning.code)).toContain('W_UNSAFE_REMOVED');
    const html = readFileSync(join(directory, 'nota.html'), 'utf8');
    expect(html).toContain(body.data.id);
    expect(html.includes('<script')).toBe(false);
    expect(html.includes('onclick')).toBe(false);
    expect(html.toLowerCase().includes('javascript:')).toBe(false);
    expect(html).toContain('Visible');
    expect(body.data.hash).toBe(
      `sha256:${createHash('sha256').update(html, 'utf8').digest('hex')}`,
    );
    expect(readFileSync(join(directory, 'otro.html'), 'utf8')).toBe('no tocar');
    expect(readFileSync(secret, 'utf8')).toBe('<p>secret</p>');

    const database = new DatabaseSync(join(directory, '.gaveta/index.sqlite'), { readOnly: true });
    try {
      const rows = database.prepare('SELECT path, id FROM notes ORDER BY path').all() as {
        path: string;
        id: string;
      }[];
      expect(rows).toEqual([{ path: 'nota.html', id: body.data.id }]);
    } finally {
      database.close();
    }

    const escape = run(['adopt', 'leak.html', '--json'], { cwd: directory });
    expect(escape.status).toBe(1);
    expect(JSON.parse(escape.stdout)).toMatchObject({
      error: { code: 'E_PATH_OUTSIDE_VAULT' },
    });
    expect(readFileSync(secret, 'utf8')).toBe('<p>secret</p>');

    const climbed = run(['adopt', '../secret.html', '--json'], { cwd: directory });
    expect(climbed.status).toBe(1);
    expect(readFileSync(secret, 'utf8')).toBe('<p>secret</p>');
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

it('initializes a new vault while GAVETA_VAULT already points to it', () => {
  const parent = mkdtempSync(join(tmpdir(), 'gaveta-e2e-init-env-'));
  const directory = join(parent, 'demo');
  try {
    const created = run(['init', directory, '--json'], {
      cwd: parent,
      env: { ...process.env, GAVETA_VAULT: directory },
    });
    expect(created.stderr).toBe('');
    expect(created.status).toBe(0);
    expect(JSON.parse(created.stdout)).toMatchObject({
      ok: true,
      command: 'init',
      data: { root: realpathSync(directory) },
    });
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});
