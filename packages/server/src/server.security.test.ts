import { expect, it } from 'vitest';
import { withVaultCopy } from './test-helpers.ts';
import {
  GAVETA_SERVE_DEFAULT_PORT,
  GAVETA_SERVE_HOST,
  GAVETA_TOKEN_HEADER,
  createGavetaServer,
} from './index.ts';

const port = GAVETA_SERVE_DEFAULT_PORT;
const hostHeader = `${GAVETA_SERVE_HOST}:${String(port)}`;

function authHeaders(token: string): Record<string, string> {
  return {
    host: hostHeader,
    [GAVETA_TOKEN_HEADER]: token,
  };
}

it('requires If-Match for write API routes', async () => {
  await withVaultCopy(async (vaultRoot) => {
    const token = 'write-token';
    const server = createGavetaServer({ vaultRoot, port, token });
    const response = await server.app.inject({
      method: 'POST',
      url: '/api/new',
      headers: {
        ...authHeaders(token),
        'content-type': 'application/json',
      },
      payload: JSON.stringify({ title: 'Nueva', type: 'doc' }),
    });
    expect(response.statusCode).toBe(428);
    const envelope = JSON.parse(response.body) as { ok: boolean; error: { code: string } };
    expect(envelope.ok).toBe(false);
    expect(envelope.error.code).toBe('E_IF_MATCH_REQUIRED');
    await server.close();
  });
});

it('rejects traversal-like refs without leaking paths', async () => {
  await withVaultCopy(async (vaultRoot) => {
    const token = 'traversal-token';
    const server = createGavetaServer({ vaultRoot, port, token });
    const response = await server.app.inject({
      method: 'GET',
      url: '/api/read?ref=..%2F..%2Fetc%2Fpasswd',
      headers: authHeaders(token),
    });
    expect(response.statusCode).toBeGreaterThanOrEqual(400);
    expect(response.body).not.toContain('/etc/passwd');
    await server.close();
  });
});

it('rejects a wrong Host header', async () => {
  await withVaultCopy(async (vaultRoot) => {
    const token = 'host-token';
    const server = createGavetaServer({ vaultRoot, port, token });
    const response = await server.app.inject({
      method: 'GET',
      url: '/api/notes',
      headers: {
        host: 'localhost:3847',
        [GAVETA_TOKEN_HEADER]: token,
      },
    });
    expect(response.statusCode).toBe(403);
    await server.close();
  });
});

it('rejects a comma-separated Host header', async () => {
  await withVaultCopy(async (vaultRoot) => {
    const token = 'host-comma-token';
    const server = createGavetaServer({ vaultRoot, port, token });
    const response = await server.app.inject({
      method: 'GET',
      url: '/api/notes',
      headers: {
        host: `${hostHeader}, evil.example`,
        [GAVETA_TOKEN_HEADER]: token,
      },
    });
    expect(response.statusCode).toBe(403);
    await server.close();
  });
});

it('rejects duplicate Host header values', async () => {
  await withVaultCopy(async (vaultRoot) => {
    const token = 'host-dup-token';
    const server = createGavetaServer({ vaultRoot, port, token });
    const response = await server.app.inject({
      method: 'GET',
      url: '/api/notes',
      headers: {
        host: [hostHeader, hostHeader],
        [GAVETA_TOKEN_HEADER]: token,
      } as unknown as { host: string; [GAVETA_TOKEN_HEADER]: string },
    });
    expect(response.statusCode).toBe(403);
    await server.close();
  });
});

it('does not leak stack traces on errors', async () => {
  await withVaultCopy(async (vaultRoot) => {
    const token = 'stack-token';
    const server = createGavetaServer({ vaultRoot, port, token });
    const response = await server.app.inject({
      method: 'GET',
      url: '/api/read?ref=no-such-note-ever',
      headers: authHeaders(token),
    });
    expect(response.statusCode).toBe(404);
    expect(response.body).not.toContain('at ');
    expect(response.body).not.toContain('node_modules');
    await server.close();
  });
});
