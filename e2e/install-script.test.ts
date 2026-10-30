import { spawn, spawnSync } from 'node:child_process';
import { existsSync, lstatSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { REPO_ROOT, parseJson } from './helpers.ts';
import { requestLocal } from './serve-http.ts';

const INSTALL_SH = join(REPO_ROOT, 'install.sh');
const children: ReturnType<typeof spawn>[] = [];

afterEach(() => {
  for (const child of children.splice(0)) {
    child.kill('SIGTERM');
  }
});

function runInstall(
  home: string,
  args: string[],
): { status: number; stdout: string; stderr: string } {
  const result = spawnSync('bash', [INSTALL_SH, ...args], {
    cwd: REPO_ROOT,
    env: { ...process.env, HOME: home, USER: 'gaveta-e2e', LOGNAME: 'gaveta-e2e' },
    encoding: 'utf8',
    timeout: 600_000,
  });
  return {
    status: result.status ?? 1,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

function gavetaBin(home: string): string {
  return join(home, '.local', 'bin', 'gaveta');
}

function runGaveta(home: string, args: string[]): ReturnType<typeof spawnSync> {
  return spawnSync(gavetaBin(home), args, {
    env: {
      ...process.env,
      HOME: home,
      PATH: `${join(home, '.local', 'bin')}:${process.env.PATH ?? ''}`,
    },
    encoding: 'utf8',
  });
}

it('T1.30: install.sh --source installs CLI, vault, serve, idempotent re-run, and --uninstall', async () => {
  const home = mkdtempSync(join(tmpdir(), 'gaveta-install-e2e-'));
  try {
    const first = runInstall(home, ['--source', REPO_ROOT, '--yes']);
    expect(first.status, first.stderr || first.stdout).toBe(0);

    const bin = gavetaBin(home);
    expect(existsSync(bin)).toBe(true);
    expect(lstatSync(bin).isSymbolicLink()).toBe(true);

    const version = runGaveta(home, ['version', '--json']);
    expect(version.status).toBe(0);
    if (typeof version.stdout !== 'string') {
      throw new Error('expected utf8 stdout from gaveta version');
    }
    const versionBody = parseJson<{ install: { method: string } }>(version.stdout);
    expect(versionBody.data.install.method).toBe('git');

    const vaultRoot = join(home, 'Gaveta');
    expect(existsSync(join(vaultRoot, '.gaveta', 'config.json'))).toBe(true);

    const doctor = runGaveta(home, ['doctor', '--json', '--vault', vaultRoot]);
    expect(doctor.status).toBe(0);

    const validate = runGaveta(home, ['validate', '--json', '--vault', vaultRoot]);
    expect(validate.status).toBe(0);

    const second = runInstall(home, ['--source', REPO_ROOT, '--yes']);
    expect(second.status, second.stderr || second.stdout).toBe(0);
    expect(existsSync(vaultRoot)).toBe(true);

    const serveChild = spawn(
      process.execPath,
      [bin, 'serve', '--json', '--port', '0', '--vault', vaultRoot],
      {
        env: { ...process.env, HOME: home },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    children.push(serveChild);
    let serveStdout = '';
    const started = await new Promise<{ port: number; token: string }>((resolve, reject) => {
      serveChild.stdout.on('data', (chunk: Buffer) => {
        serveStdout += chunk.toString('utf8');
        if (serveStdout.includes('"schemaVersion"')) {
          try {
            const body = parseJson<{ port: number; token: string }>(serveStdout);
            resolve({ port: body.data.port, token: body.data.token });
          } catch (error) {
            reject(error instanceof Error ? error : new Error(String(error)));
          }
        }
      });
      serveChild.on('error', reject);
      serveChild.stderr.on('data', (chunk: Buffer) => {
        const text = chunk.toString('utf8');
        if (text.length > 0) {
          reject(new Error(text));
        }
      });
    });

    const notes = await requestLocal(started.port, '/api/notes', {
      'x-gaveta-token': started.token,
    });
    expect(notes.status).toBe(200);

    const uninstall = runInstall(home, ['--uninstall', '--yes']);
    expect(uninstall.status).toBe(0);
    expect(existsSync(bin)).toBe(false);
    expect(existsSync(vaultRoot)).toBe(true);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

it('T1.30: install.sh --dry-run does not write symlinks', () => {
  const home = mkdtempSync(join(tmpdir(), 'gaveta-install-dry-'));
  try {
    const dry = runInstall(home, ['--source', REPO_ROOT, '--dry-run']);
    expect(dry.status).toBe(0);
    expect(existsSync(gavetaBin(home))).toBe(false);
    expect(`${dry.stdout}\n${dry.stderr}`).toContain('dry-run');
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});
