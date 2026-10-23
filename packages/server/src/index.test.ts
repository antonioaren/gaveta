import { expect, it } from 'vitest';
import { requestLocal } from './http-test.ts';
import { withVaultCopy } from './test-helpers.ts';
import { VaultIndexSession } from './vault-index.ts';
import {
  GAVETA_TOKEN_HEADER,
  LINKED_CORE_PACKAGE_ID,
  SERVER_PACKAGE_ID,
  createGavetaServer,
} from './index.ts';

it('links the server to core', () => {
  expect(SERVER_PACKAGE_ID).toBe('@gaveta/server');
  expect(LINKED_CORE_PACKAGE_ID).toBe('@gaveta/core');
});

function authHeaders(token: string): Record<string, string> {
  return {
    [GAVETA_TOKEN_HEADER]: token,
  };
}

it('opens the vault index for a copied fixture', async () => {
  await withVaultCopy(async (vaultRoot) => {
    const session = new VaultIndexSession(vaultRoot);
    const { result } = await session.withIndex((index) => {
      return Promise.resolve(index.notes().length);
    });
    expect(result).toBeGreaterThan(0);
    session.close();
  });
});

it('lists notes with a valid token', async () => {
  await withVaultCopy(async (vaultRoot) => {
    const token = 'test-token-notes';
    const server = createGavetaServer({ vaultRoot, port: 0, token });
    const address = await server.listen();
    const response = await requestLocal(address.port, '/api/notes', authHeaders(token));
    expect(response.status).toBe(200);
    const body = JSON.parse(response.body) as { ok: boolean; data: { notes: { path: string }[] } };
    expect(body.ok).toBe(true);
    expect(body.data.notes.length).toBeGreaterThan(0);
    await server.close();
  });
});

it('rejects API calls without a token', async () => {
  await withVaultCopy(async (vaultRoot) => {
    const server = createGavetaServer({ vaultRoot, port: 0, token: 'secret' });
    const address = await server.listen();
    const response = await requestLocal(address.port, '/api/notes');
    expect(response.status).toBe(401);
    const body = JSON.parse(response.body) as { error: { code: string } };
    expect(body.error.code).toBe('E_AUTH_REQUIRED');
    await server.close();
  });
});

it('rejects a hostile Origin header', async () => {
  await withVaultCopy(async (vaultRoot) => {
    const token = 'origin-token';
    const server = createGavetaServer({ vaultRoot, port: 0, token });
    const address = await server.listen();
    const response = await requestLocal(address.port, '/api/notes', {
      ...authHeaders(token),
      origin: `http://evil.example:${String(address.port)}`,
    });
    expect(response.status).toBe(403);
    await server.close();
  });
});

it('requires a token for /api/session', async () => {
  await withVaultCopy(async (vaultRoot) => {
    const token = 'bootstrap-token';
    const server = createGavetaServer({ vaultRoot, port: 0, token });
    const address = await server.listen();
    const response = await requestLocal(address.port, '/api/session');
    expect(response.status).toBe(401);
    await server.close();
  });
});
