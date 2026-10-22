import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
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
import { expect, it } from 'vitest';

const root = join(import.meta.dirname, '..');
const bin = join(root, 'packages/cli/bin/gaveta.js');

interface CliManifest {
  bin: { gaveta: string; gv: string };
  version: string;
}

const manifest = JSON.parse(
  readFileSync(join(root, 'packages/cli/package.json'), 'utf8'),
) as CliManifest;

interface RunResult {
  stdout: string;
  stderr: string;
  status: number;
}

function childEnv(overrides: Record<string, string> = {}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  delete env.GAVETA_VAULT;
  for (const [key, value] of Object.entries(overrides)) {
    env[key] = value;
  }
  return env;
}

function run(
  args: readonly string[],
  options: { cwd?: string; env?: NodeJS.ProcessEnv; input?: Buffer | string } = {},
): RunResult {
  const result = spawnSync(process.execPath, [bin, ...args], {
    cwd: options.cwd,
    env: options.env ?? childEnv(),
    input: options.input,
    encoding: 'utf8',
  });
  return {
    stdout: result.stdout,
    stderr: result.stderr,
    status: result.status ?? 1,
  };
}

function makeVault(parent: string, name: string): string {
  const directory = join(parent, name);
  mkdirSync(join(directory, '.gaveta'), { recursive: true });
  return directory;
}

it('points gaveta and gv at the same binary', () => {
  expect(manifest.bin.gaveta).toBe('./bin/gaveta.js');
  expect(manifest.bin.gv).toBe(manifest.bin.gaveta);
  expect(realpathSync(join(root, 'packages/cli', manifest.bin.gaveta))).toBe(realpathSync(bin));
});

it('snapshots the version JSON envelope', () => {
  const directory = mkdtempSync(join(tmpdir(), 'gaveta-e2e-version-'));
  try {
    const result = run(['version', '--json'], { cwd: directory });
    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toMatchSnapshot();

    const reordered = run(['--json', 'version'], { cwd: directory });
    expect(reordered.status).toBe(0);
    expect(reordered.stdout).toBe(result.stdout);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

it('prints a human version and Spanish help', () => {
  const directory = mkdtempSync(join(tmpdir(), 'gaveta-e2e-human-'));
  try {
    const version = run(['version'], { cwd: directory });
    expect(version.status).toBe(0);
    expect(version.stdout).toBe(`gaveta ${manifest.version}\n`);
    expect(version.stderr).toBe('');
    expect(version.stdout.startsWith('{')).toBe(false);

    const help = run([], { cwd: directory });
    expect(help.status).toBe(0);
    expect(help.stdout).toContain('Uso: gaveta');
    expect(help.stdout).toContain('version');
    expect(help.stdout).toContain('gaveta version --json');
    expect(help.stdout).toContain('--from');
    expect(help.stdout).toContain('--vault');
    expect(help.stdout).not.toContain('Usage:');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

it('returns usage and not-found exit codes with Spanish errors', () => {
  const directory = mkdtempSync(join(tmpdir(), 'gaveta-e2e-errors-'));
  try {
    const human = run(['nope'], { cwd: directory });
    expect(human.status).toBe(1);
    expect(human.stdout).toBe('');
    expect(human.stderr).toContain(
      'E_ARG_INVALID: El argumento falta o está fuera de rango.\nConsulta gaveta guide para ver los valores que admite el comando.\nEl comando no existe.\n',
    );
    expect(human.stderr.toLowerCase()).not.toContain('unknown command');

    const json = run(['--json', 'nope'], { cwd: directory });
    expect(json.status).toBe(1);
    expect(json.stderr).toBe('');
    expect(JSON.parse(json.stdout)).toEqual({
      ok: false,
      schemaVersion: 1,
      command: 'nope',
      error: {
        code: 'E_ARG_INVALID',
        message: 'El argumento falta o está fuera de rango.',
        hint: 'Consulta gaveta guide para ver los valores que admite el comando.',
        details: { problem: 'El comando no existe.' },
      },
    });

    const missing = run(['version', '--json', '--vault', join(directory, 'missing')], {
      cwd: directory,
    });
    expect(missing.status).toBe(4);
    expect(JSON.parse(missing.stdout)).toMatchObject({
      ok: false,
      command: 'version',
      error: {
        code: 'E_VAULT_NOT_FOUND',
        message: 'No se ha encontrado un vault.',
        hint: 'Indica --vault, define GAVETA_VAULT o sitúate en un directorio que contenga .gaveta/.',
      },
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

it('wires --vault, GAVETA_VAULT, and the upward search', () => {
  const parent = mkdtempSync(join(tmpdir(), 'gaveta-e2e-vault-'));
  try {
    const byOption = makeVault(parent, 'by-option');
    const byEnv = makeVault(parent, 'by-env');
    const byWalk = makeVault(parent, 'by-walk');
    const nested = join(byWalk, 'a', 'b');
    mkdirSync(nested, { recursive: true });
    const elsewhere = join(parent, 'elsewhere');
    mkdirSync(elsewhere);

    const option = run(['version', '--json', '--vault', byOption], {
      cwd: elsewhere,
      env: childEnv({ GAVETA_VAULT: byEnv }),
    });
    expect(option.status).toBe(0);
    expect(JSON.parse(option.stdout)).toMatchObject({
      data: { vault: { root: realpathSync(byOption), source: 'option' } },
    });

    const env = run(['version', '--json'], {
      cwd: elsewhere,
      env: childEnv({ GAVETA_VAULT: byEnv }),
    });
    expect(JSON.parse(env.stdout)).toMatchObject({
      data: { vault: { root: realpathSync(byEnv), source: 'env' } },
    });

    const walked = run(['version', '--json'], { cwd: nested });
    expect(JSON.parse(walked.stdout)).toMatchObject({
      data: { vault: { root: realpathSync(byWalk), source: 'search' } },
    });
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

it('reads 1 MiB of stdin and a --from file without loss', () => {
  const directory = mkdtempSync(join(tmpdir(), 'gaveta-e2e-stdin-'));
  try {
    const payload = Buffer.alloc(1024 * 1024, 0x61);
    const stdin = run(['version', '--json', '--from', '-'], { cwd: directory, input: payload });
    expect(stdin.status).toBe(0);
    expect(JSON.parse(stdin.stdout)).toMatchObject({
      data: {
        input: {
          source: 'stdin',
          bytes: payload.length,
          sha256: createHash('sha256').update(payload).digest('hex'),
        },
      },
    });

    const outside = mkdtempSync(join(tmpdir(), 'gaveta-e2e-from-'));
    try {
      const text = '<article>á</article>';
      writeFileSync(join(outside, 'nota.html'), text);
      const file = run(['version', '--json', '--from', join(outside, 'nota.html')], {
        cwd: directory,
      });
      expect(file.status).toBe(0);
      expect(JSON.parse(file.stdout)).toMatchObject({
        data: {
          input: {
            source: 'file',
            bytes: Buffer.byteLength(text),
            sha256: createHash('sha256').update(text).digest('hex'),
          },
        },
      });
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

it('does not follow a .gaveta symlink that leaves the directory', () => {
  const parent = mkdtempSync(join(tmpdir(), 'gaveta-e2e-escape-'));
  try {
    const vault = makeVault(parent, 'vault');
    const child = join(vault, 'child');
    const outside = join(parent, 'outside-marker');
    mkdirSync(child);
    mkdirSync(outside);
    writeFileSync(join(outside, 'secret.txt'), 'TOP-SECRET');
    symlinkSync(outside, join(child, '.gaveta'), 'dir');

    const result = run(['version', '--json'], { cwd: child });
    expect(result.status).toBe(1);
    expect(result.stdout).not.toContain('TOP-SECRET');
    expect(result.stderr).not.toContain('TOP-SECRET');
    expect(JSON.parse(result.stdout)).toMatchObject({
      error: {
        code: 'E_PATH_OUTSIDE_VAULT',
        message: 'La ruta sale del vault.',
      },
    });
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});
