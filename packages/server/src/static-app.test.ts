import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { expect, it } from 'vitest';
import { GAVETA_TOKEN_HEADER, createGavetaServer } from './index.ts';
import { requestLocal } from './http-test.ts';
import { withVaultCopy } from './test-helpers.ts';

function authHeaders(token: string): Record<string, string> {
  return {
    [GAVETA_TOKEN_HEADER]: token,
  };
}

function writeMinimalWebRoot(dir: string): void {
  mkdirSync(join(dir, 'assets'), { recursive: true });
  writeFileSync(
    join(dir, 'index.html'),
    '<!DOCTYPE html><html><head><title>Gaveta</title></head><body>shell</body></html>',
    'utf8',
  );
  writeFileSync(join(dir, 'assets', 'app.js'), 'console.log("ok");', 'utf8');
}

it('serves the built web shell without a token and applies a strict app CSP', async () => {
  await withVaultCopy(async (vaultRoot) => {
    const webRoot = join(tmpdir(), `gaveta-web-${String(Date.now())}`);
    writeMinimalWebRoot(webRoot);
    const token = 'static-shell-token';
    const server = createGavetaServer({ vaultRoot, port: 0, token, webRoot });
    const address = await server.listen();
    const port = address.port;

    const index = await requestLocal(port, '/');
    expect(index.status).toBe(200);
    expect(index.body).toContain('shell');

    const graph = await requestLocal(port, '/grafo');
    expect(graph.status).toBe(200);
    expect(graph.body).toContain('shell');

    const tasks = await requestLocal(port, '/tareas');
    expect(tasks.status).toBe(200);
    expect(tasks.body).toContain('shell');
    const csp = index.headers['content-security-policy'];
    expect(csp).toBeDefined();
    expect(csp).toContain("default-src 'self'");
    expect(csp).not.toContain('https://');

    const asset = await requestLocal(port, '/assets/app.js');
    expect(asset.status).toBe(200);
    expect(asset.body).toContain('console.log');

    await server.close();
  });
});

it('still requires a token for API routes when the web shell is enabled', async () => {
  await withVaultCopy(async (vaultRoot) => {
    const webRoot = join(tmpdir(), `gaveta-web-api-${String(Date.now())}`);
    writeMinimalWebRoot(webRoot);
    const token = 'static-api-token';
    const server = createGavetaServer({ vaultRoot, port: 0, token, webRoot });
    const address = await server.listen();
    const port = address.port;

    const denied = await requestLocal(port, '/api/notes');
    expect(denied.status).toBe(401);

    const allowed = await requestLocal(port, '/api/notes', authHeaders(token));
    expect(allowed.status).toBe(200);

    await server.close();
  });
});
