import { spawn, spawnSync } from 'node:child_process';
import { existsSync, lstatSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { REPO_ROOT, parseJson } from './helpers.ts';
import { requestLocal } from './serve-http.ts';

const INSTALL_SH = join(REPO_ROOT, 'install.sh');
const children: ReturnType<typeof spawn>[] = [];

function homeEnv(home: string): NodeJS.ProcessEnv {
  return { ...process.env, HOME: home, USER: 'gaveta-e2e', LOGNAME: 'gaveta-e2e' };
}

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
    env: homeEnv(home),
    encoding: 'utf8',
    timeout: 600_000,
  });
  return {
    status: result.status ?? 1,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

function gitCloneCheckout(home: string, installDir: string): void {
  const parent = join(installDir, '..');
  const result = spawnSync('git', ['clone', `file://${REPO_ROOT}`, installDir], {
    cwd: parent,
    env: homeEnv(home),
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || 'git clone failed');
  }
}

function clonedBranch(installDir: string): string {
  const result = spawnSync('git', ['-C', installDir, 'rev-parse', '--abbrev-ref', 'HEAD'], {
    encoding: 'utf8',
  });
  if (result.status !== 0 || typeof result.stdout !== 'string') {
    throw new Error('failed to detect branch in cloned checkout');
  }
  return result.stdout.trim();
}

function envSnippetPath(installDir: string): string {
  return join(installDir, 'env.sh');
}

it('T1.30: install.sh --dir writes env.sh under the custom install directory', () => {
  const home = mkdtempSync(join(tmpdir(), 'gaveta-install-dir-'));
  const installDir = join(home, 'custom-install');
  try {
    const result = runInstall(home, ['--source', REPO_ROOT, '--dir', installDir, '--yes']);
    expect(result.status, result.stderr || result.stdout).toBe(0);
    const snippet = envSnippetPath(installDir);
    expect(existsSync(snippet)).toBe(true);
    const raw = readFileSync(snippet, 'utf8');
    expect(raw).toContain(`GAVETA_VAULT="${join(home, 'Gaveta')}"`);
    expect(existsSync(join(installDir, '.install-meta'))).toBe(true);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

it('T1.30: install.sh --vault-dir creates the vault at the given path', () => {
  const home = mkdtempSync(join(tmpdir(), 'gaveta-install-vault-'));
  const vaultDir = join(home, 'Notes', 'Vault');
  try {
    const result = runInstall(home, ['--source', REPO_ROOT, '--vault-dir', vaultDir, '--yes']);
    expect(result.status, result.stderr).toBe(0);
    expect(existsSync(join(vaultDir, '.gaveta', 'config.json'))).toBe(true);
    expect(existsSync(join(home, 'Gaveta', '.gaveta', 'config.json'))).toBe(false);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

it('T1.30: install.sh --no-vault skips env.sh and starter vault', () => {
  const home = mkdtempSync(join(tmpdir(), 'gaveta-install-novault-'));
  const installDir = join(home, '.local', 'share', 'gaveta');
  try {
    const result = runInstall(home, ['--source', REPO_ROOT, '--no-vault', '--yes']);
    expect(result.status, result.stderr).toBe(0);
    expect(existsSync(envSnippetPath(installDir))).toBe(false);
    expect(existsSync(join(home, 'Gaveta'))).toBe(false);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

it('T1.30: install.sh --no-skill skips skill install when ~/.cursor exists', () => {
  const home = mkdtempSync(join(tmpdir(), 'gaveta-install-noskill-'));
  try {
    spawnSync('mkdir', ['-p', join(home, '.cursor')], { env: homeEnv(home) });
    const result = runInstall(home, ['--source', REPO_ROOT, '--no-skill', '--yes']);
    expect(result.status, result.stderr).toBe(0);
    expect(existsSync(join(home, '.cursor', 'skills', 'gaveta', 'SKILL.md'))).toBe(false);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

it('T1.30: install.sh --dry-run logs ref and repo without writing symlinks', () => {
  const home = mkdtempSync(join(tmpdir(), 'gaveta-install-dryflags-'));
  try {
    const dry = runInstall(home, [
      '--dry-run',
      '--ref',
      'my-ref',
      '--repo',
      'https://example.com/gaveta.git',
    ]);
    expect(dry.status).toBe(0);
    expect(existsSync(gavetaBin(home))).toBe(false);
    const log = `${dry.stdout}\n${dry.stderr}`;
    expect(log).toContain('dry-run');
    expect(log).toContain('my-ref');
    expect(log).toContain('https://example.com/gaveta.git');
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

it('T1.30: install.sh --uninstall --purge --yes removes a non-source install directory', () => {
  const home = mkdtempSync(join(tmpdir(), 'gaveta-install-purge-'));
  const installDir = join(home, 'gaveta-checkout');
  try {
    gitCloneCheckout(home, installDir);
    const branch = clonedBranch(installDir);
    const install = runInstall(home, ['--dir', installDir, '--ref', branch, '--yes']);
    expect(install.status, install.stderr).toBe(0);
    expect(existsSync(gavetaBin(home))).toBe(true);

    const uninstall = runInstall(home, [
      '--dir',
      installDir,
      '--ref',
      branch,
      '--uninstall',
      '--purge',
      '--yes',
    ]);
    expect(uninstall.status, uninstall.stderr).toBe(0);
    expect(existsSync(gavetaBin(home))).toBe(false);
    expect(existsSync(installDir)).toBe(false);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

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

it('T1.30: re-run install with --source is idempotent', () => {
  const home = mkdtempSync(join(tmpdir(), 'gaveta-install-idem-'));
  const vaultRoot = join(home, 'Gaveta');
  try {
    const first = runInstall(home, ['--source', REPO_ROOT, '--yes']);
    expect(first.status, first.stderr).toBe(0);
    const second = runInstall(home, ['--source', REPO_ROOT, '--yes']);
    expect(second.status, second.stderr).toBe(0);
    expect(existsSync(join(vaultRoot, '.gaveta', 'config.json'))).toBe(true);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

it('T1.30: install.sh --source installs CLI, vault, serve, and --uninstall', async () => {
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
