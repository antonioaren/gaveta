import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
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

function runInstall(home: string, args: string[]): { status: number; stderr: string } {
  const result = spawnSync('bash', [INSTALL_SH, ...args], {
    cwd: REPO_ROOT,
    env: { ...process.env, HOME: home, USER: 'gaveta-e2e', LOGNAME: 'gaveta-e2e' },
    encoding: 'utf8',
    timeout: 600_000,
  });
  return { status: result.status ?? 1, stderr: result.stderr };
}

function loadEnvExports(home: string): NodeJS.ProcessEnv {
  const envPath = join(home, '.local', 'share', 'gaveta', 'env.sh');
  const raw = readFileSync(envPath, 'utf8');
  const extra: NodeJS.ProcessEnv = { ...process.env, HOME: home };
  for (const line of raw.split('\n')) {
    const match = /^export ([A-Z_]+)="(.*)"\s*$/.exec(line);
    if (match !== null) {
      extra[match[1]] = match[2];
    }
  }
  return extra;
}

/** README Quick start: after install, `gaveta serve` with GAVETA_VAULT from env.sh (no --vault flag). */
it('README quick start: gaveta serve discovers vault from env.sh', async () => {
  const home = mkdtempSync(join(tmpdir(), 'gaveta-readme-qs-'));
  try {
    const install = runInstall(home, ['--source', REPO_ROOT, '--yes']);
    expect(install.status, install.stderr).toBe(0);

    const env = loadEnvExports(home);
    const gaveta = join(home, '.local', 'bin', 'gaveta');
    expect(existsSync(gaveta)).toBe(true);

    const child = spawn(process.execPath, [gaveta, 'serve', '--json', '--port', '0'], {
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    children.push(child);
    let stdout = '';
    const started = await new Promise<{ port: number; token: string }>((resolve, reject) => {
      child.stdout.on('data', (chunk: Buffer) => {
        stdout += chunk.toString('utf8');
        if (stdout.includes('"schemaVersion"')) {
          try {
            const body = parseJson<{ port: number; token: string }>(stdout);
            resolve({ port: body.data.port, token: body.data.token });
          } catch (error) {
            reject(error instanceof Error ? error : new Error(String(error)));
          }
        }
      });
      child.on('error', reject);
      child.stderr.on('data', (chunk: Buffer) => {
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
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

/** docs/quick-start.md § First linked notes (installed CLI + GAVETA_VAULT). */
it('quick-start first notes: new, read, search, doctor', () => {
  const home = mkdtempSync(join(tmpdir(), 'gaveta-readme-notes-'));
  const vaultDir = join(home, 'Gaveta');
  try {
    const install = runInstall(home, ['--source', REPO_ROOT, '--yes']);
    expect(install.status, install.stderr).toBe(0);

    const env = loadEnvExports(home);
    const gaveta = join(home, '.local', 'bin', 'gaveta');
    const run = (args: string[], input?: string) =>
      spawnSync(process.execPath, [gaveta, ...args], { env, encoding: 'utf8', input });

    const otherBody =
      '<article><h1>Other</h1><section id="body"><p>Reference note.</p></section></article>';
    const other = run(['new', 'Other', '--type', 'doc', '--from', '-', '--json'], otherBody);
    expect(other.status).toBe(0);
    expect(other.stderr).toBe('');

    const origenBody =
      '<article><h1>Origin</h1><section id="body"><p>See [[Other]]</p></section></article>';
    const origen = run(['new', 'Origin', '--type', 'doc', '--from', '-', '--json'], origenBody);
    expect(origen.status).toBe(0);

    const read = run(['read', 'Origin', '--as', 'outline', '--json']);
    expect(read.status).toBe(0);
    if (typeof read.stdout !== 'string') {
      throw new Error('expected utf8 stdout from gaveta read');
    }
    const outline = JSON.parse(read.stdout) as {
      data: { outline: { sections: { id: string }[] } };
    };
    expect(outline.data.outline.sections.some((section) => section.id === 'body')).toBe(true);

    const search = run(['search', 'Other', '--json']);
    expect(search.status).toBe(0);

    const doctor = run(['doctor', '--json']);
    expect(doctor.status).toBe(0);

    expect(existsSync(join(vaultDir, 'other.html'))).toBe(true);
    expect(existsSync(join(vaultDir, 'origin.html'))).toBe(true);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});
