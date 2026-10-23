import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { createGavetaServer, GAVETA_TOKEN_HEADER } from './index.ts';
import { requestLocal } from './http-test.ts';
import { withVaultCopy } from './test-helpers.ts';

function authHeaders(token: string): Record<string, string> {
  return {
    [GAVETA_TOKEN_HEADER]: token,
  };
}

function writeMinimalWebRoot(dir: string): void {
  mkdirSync(join(dir, 'assets'), { recursive: true });
  writeFileSync(join(dir, 'index.html'), '<!DOCTYPE html><html><body>shell</body></html>', 'utf8');
  writeFileSync(join(dir, 'assets', 'app.js'), 'ok', 'utf8');
}

const BYPASS_PATHS = ['/api/notes', '/%61pi/notes', '//api/notes', '/api', '/API/notes'] as const;

it('deny-by-default: encoded, slash and case variants still require a token', async () => {
  await withVaultCopy(async (vaultRoot) => {
    const webRoot = join(tmpdir(), `gaveta-auth-${String(Date.now())}`);
    writeMinimalWebRoot(webRoot);
    const token = 'deny-default-token';
    const server = createGavetaServer({ vaultRoot, port: 0, token, webRoot });
    const address = await server.listen();
    const port = address.port;

    for (const path of BYPASS_PATHS) {
      const denied = await requestLocal(port, path);
      expect(denied.status, path).toBe(401);
    }

    const renderDenied = await requestLocal(port, '/render/01JB7Z3K9QX4T5M2N8V6R0WYHC');
    expect(renderDenied.status).toBe(401);

    const allowed = await requestLocal(port, '/api/notes', authHeaders(token));
    expect(allowed.status).toBe(200);

    await server.close();
  });
});

it('does not serve the SPA shell for unknown client paths', async () => {
  await withVaultCopy(async (vaultRoot) => {
    const webRoot = join(tmpdir(), `gaveta-spa-404-${String(Date.now())}`);
    writeMinimalWebRoot(webRoot);
    const token = 'spa-404-token';
    const server = createGavetaServer({ vaultRoot, port: 0, token, webRoot });
    const address = await server.listen();
    const port = address.port;

    const typo = await requestLocal(port, '/typo-ruta', authHeaders(token));
    expect(typo.status).toBe(404);
    expect(typo.body).not.toContain('shell');

    const renderMissing = await requestLocal(
      port,
      '/render/01JB7Z3K9QX4T5M2N8V6R0WYHD',
      authHeaders(token),
    );
    expect(renderMissing.status).toBe(401);

    const nota = await requestLocal(port, '/nota/demo');
    expect(nota.status).toBe(200);
    expect(nota.body).toContain('shell');

    await server.close();
  });
});

it('applies app-shell CSP only on public shell routes', async () => {
  await withVaultCopy(async (vaultRoot) => {
    const webRoot = join(tmpdir(), `gaveta-csp-${String(Date.now())}`);
    writeMinimalWebRoot(webRoot);
    const token = 'csp-token';
    const server = createGavetaServer({ vaultRoot, port: 0, token, webRoot });
    const address = await server.listen();
    const port = address.port;

    const shell = await requestLocal(port, '/');
    expect(String(shell.headers['content-security-policy'])).toContain("default-src 'self'");

    const api = await requestLocal(port, '/api/notes', authHeaders(token));
    expect(String(api.headers['content-security-policy'])).toContain("frame-ancestors 'none'");
    expect(String(api.headers['content-security-policy'])).not.toContain("default-src 'self'");

    await server.close();
  });
});
