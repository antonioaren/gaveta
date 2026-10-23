import { spawn } from 'node:child_process';
import { afterEach, expect, it } from 'vitest';
import { GAVETA_BIN, initVault, parseJson, withTempVaultAsync } from './helpers.ts';
import { requestLocal } from './serve-http.ts';

const children: ReturnType<typeof spawn>[] = [];

afterEach(() => {
  for (const child of children.splice(0)) {
    child.kill('SIGTERM');
  }
});

async function startServe(vault: string): Promise<{ port: number; token: string }> {
  const child = spawn(process.execPath, [GAVETA_BIN, 'serve', '--json', '--port', '0'], {
    cwd: vault,
    env: { ...process.env, GAVETA_VAULT: vault },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  children.push(child);
  let stdout = '';
  let settled = false;
  return await new Promise((resolve, reject) => {
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
      if (!settled && stdout.includes('"schemaVersion"')) {
        settled = true;
        const json = parseJson(stdout) as { data: { port: number; token: string } };
        resolve({ port: json.data.port, token: json.data.token });
      }
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (!settled && code !== 0) {
        reject(new Error(`serve failed: ${String(code)}`));
      }
    });
  });
}

it('REQ-SEC-06: rejects a forged Origin header', async () => {
  await withTempVaultAsync(async (vault) => {
    initVault(vault);
    const { port, token } = await startServe(vault);
    const response = await requestLocal(port, '/api/notes', {
      origin: 'http://evil.example:80',
      'x-gaveta-token': token,
    });
    expect(response.status).toBe(403);
  });
});

it('rejects path traversal in read refs', async () => {
  await withTempVaultAsync(async (vault) => {
    initVault(vault);
    const { port, token } = await startServe(vault);
    const response = await requestLocal(
      port,
      `/api/read?ref=${encodeURIComponent('../../../etc/passwd')}`,
      { 'x-gaveta-token': token },
    );
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.body).not.toContain('root:');
  });
});
