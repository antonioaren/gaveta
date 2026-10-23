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

it('rejects POST on read-only API', async () => {
  await withVaultCopy(async (vaultRoot) => {
    const token = 'readonly-token';
    const server = createGavetaServer({ vaultRoot, port, token });
    const response = await server.app.inject({
      method: 'POST',
      url: '/api/notes',
      headers: authHeaders(token),
      payload: '{}',
    });
    expect(response.statusCode).toBe(400);
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
