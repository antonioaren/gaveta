import { expect, it } from 'vitest';
import { requestLocal } from './http-test.ts';
import { withVaultCopy } from './test-helpers.ts';
import { GAVETA_TOKEN_HEADER, createGavetaServer } from './index.ts';

const API_PATHS = [
  '/api/session',
  '/api/notes',
  '/api/doctor',
  '/api/graph',
  '/api/search?q=test',
  '/api/wikilink-complete?q=',
] as const;

const REQUIRED_SECURITY_HEADERS = [
  'cache-control',
  'x-content-type-options',
  'referrer-policy',
  'x-frame-options',
  'content-security-policy',
  'cross-origin-resource-policy',
] as const;

function authHeaders(token: string): Record<string, string> {
  return {
    [GAVETA_TOKEN_HEADER]: token,
  };
}

function expectSecurityHeaders(headers: Record<string, string | string[] | undefined>): void {
  for (const name of REQUIRED_SECURITY_HEADERS) {
    expect(headers[name], name).toBeDefined();
  }
  expect(String(headers['cache-control']).toLowerCase()).toBe('no-store');
  expect(String(headers['x-content-type-options']).toLowerCase()).toBe('nosniff');
  expect(String(headers['referrer-policy']).toLowerCase()).toBe('no-referrer');
  expect(String(headers['x-frame-options']).toUpperCase()).toBe('DENY');
  expect(String(headers['content-security-policy'])).toContain("frame-ancestors 'none'");
  expect(String(headers['cross-origin-resource-policy']).toLowerCase()).toBe('same-origin');
}

it('never leaks the session token on tokenless API requests', async () => {
  await withVaultCopy(async (vaultRoot) => {
    const token = 'leak-test-token-do-not-expose-in-body';
    const server = createGavetaServer({ vaultRoot, port: 0, token });
    const address = await server.listen();
    for (const path of API_PATHS) {
      const response = await requestLocal(address.port, path);
      expect(response.status).toBe(401);
      expect(response.body).not.toContain(token);
      expect(response.body).not.toMatch(/"token"\s*:/u);
    }
    await server.close();
  });
});

it('confirms session without echoing the token when authenticated', async () => {
  await withVaultCopy(async (vaultRoot) => {
    const token = 'authenticated-session-check-token';
    const server = createGavetaServer({ vaultRoot, port: 0, token });
    const address = await server.listen();
    const response = await requestLocal(address.port, '/api/session', authHeaders(token));
    expect(response.status).toBe(200);
    const body = JSON.parse(response.body) as { ok: boolean; data: Record<string, unknown> };
    expect(body.ok).toBe(true);
    expect(body.data).not.toHaveProperty('token');
    expect(body.data).toHaveProperty('host');
    expect(body.data).toHaveProperty('port');
    expect(response.body).not.toContain(token);
    await server.close();
  });
});

it('sets security headers on success and error responses', async () => {
  await withVaultCopy(async (vaultRoot) => {
    const token = 'security-headers-token';
    const server = createGavetaServer({ vaultRoot, port: 0, token });
    const address = await server.listen();
    const ok = await requestLocal(address.port, '/api/notes', authHeaders(token));
    expect(ok.status).toBe(200);
    expectSecurityHeaders(ok.headers);

    const err = await requestLocal(address.port, '/api/notes');
    expect(err.status).toBe(401);
    expectSecurityHeaders(err.headers);
    await server.close();
  });
});

it('rejects duplicate query parameters', async () => {
  await withVaultCopy(async (vaultRoot) => {
    const token = 'dup-query-token';
    const server = createGavetaServer({ vaultRoot, port: 0, token });
    const address = await server.listen();
    const response = await requestLocal(
      address.port,
      '/api/read?ref=alpha&ref=beta',
      authHeaders(token),
    );
    expect(response.status).toBe(400);
    const body = JSON.parse(response.body) as { error: { code: string } };
    expect(body.error.code).toBe('E_ARG_INVALID');
    await server.close();
  });
});

it('removes signal listeners when the server closes', async () => {
  await withVaultCopy(async (vaultRoot) => {
    const beforeInt = process.listenerCount('SIGINT');
    const beforeTerm = process.listenerCount('SIGTERM');
    for (let i = 0; i < 3; i += 1) {
      const server = createGavetaServer({ vaultRoot, port: 0, token: `sig-${String(i)}` });
      void server.waitForShutdown();
      await server.close();
    }
    expect(process.listenerCount('SIGINT')).toBe(beforeInt);
    expect(process.listenerCount('SIGTERM')).toBe(beforeTerm);
  });
});
