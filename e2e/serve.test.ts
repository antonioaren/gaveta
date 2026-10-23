import { spawn } from 'node:child_process';
import { afterEach, expect, it } from 'vitest';
import {
  GAVETA_BIN,
  initVault,
  parseJson,
  withTempVaultAsync,
  type JsonEnvelope,
} from './helpers.ts';
import { requestLocal } from './serve-http.ts';

const children: ReturnType<typeof spawn>[] = [];

afterEach(() => {
  for (const child of children.splice(0)) {
    child.kill('SIGTERM');
  }
});

function startServe(vault: string): Promise<{
  stdout: string;
  json: JsonEnvelope<{ port: number; token: string; url: string }>;
}> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [GAVETA_BIN, 'serve', '--json', '--port', '0'], {
      cwd: vault,
      env: { ...process.env, GAVETA_VAULT: vault },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    children.push(child);
    let stdout = '';
    let settled = false;
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
      if (!settled && stdout.includes('"schemaVersion"')) {
        settled = true;
        try {
          resolve({ stdout, json: parseJson(stdout) });
        } catch (error) {
          reject(error instanceof Error ? error : new Error(String(error)));
        }
      }
    });
    child.stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf8');
      if (text.length > 0 && !settled) {
        reject(new Error(text));
      }
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (!settled && code !== 0) {
        reject(new Error(`serve exited with ${String(code)}`));
      }
    });
  });
}

async function fetchApi(
  port: number,
  token: string,
  path: string,
  headers: Record<string, string> = {},
): Promise<{ status: number; body: string }> {
  return requestLocal(port, path, {
    'x-gaveta-token': token,
    ...headers,
  });
}

it('REQ-CLI-12: gaveta serve prints a localhost URL and serves read APIs', async () => {
  await withTempVaultAsync(async (vault) => {
    initVault(vault);
    const started = await startServe(vault);
    expect(started.json.ok).toBe(true);
    expect(started.json.command).toBe('serve');
    const { port, token, url } = started.json.data;
    expect(url).toContain(`127.0.0.1:${String(port)}`);
    expect(url).toContain('token=');

    const notes = await fetchApi(port, token, '/api/notes');
    expect(notes.status).toBe(200);
    const payload = JSON.parse(notes.body) as { ok: boolean };
    expect(payload.ok).toBe(true);
  });
});

it('REQ-SEC-06: rejects API calls without the session token', async () => {
  await withTempVaultAsync(async (vault) => {
    initVault(vault);
    const started = await startServe(vault);
    const { port } = started.json.data;
    const response = await requestLocal(port, '/api/notes');
    expect(response.status).toBe(401);
  });
});
