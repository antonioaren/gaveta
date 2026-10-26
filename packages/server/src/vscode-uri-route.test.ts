import { expect, it } from 'vitest';
import { GAVETA_TOKEN_HEADER, createGavetaServer } from './index.ts';
import { requestLocal } from './http-test.ts';
import { withVaultCopy } from './test-helpers.ts';

function authHeaders(token: string, port: number): Record<string, string> {
  return {
    [GAVETA_TOKEN_HEADER]: token,
    host: `127.0.0.1:${String(port)}`,
  };
}

it('returns a vscode file URI for a valid note ref', async () => {
  await withVaultCopy(async (vaultRoot) => {
    const token = 'vscode-uri';
    const server = createGavetaServer({ vaultRoot, port: 0, token });
    const address = await server.listen();
    const response = await requestLocal(
      address.port,
      '/api/note/vscode-uri?ref=Nota%20X',
      authHeaders(token, address.port),
      'GET',
    );
    expect(response.status).toBe(200);
    const parsed = JSON.parse(response.body) as {
      ok: boolean;
      data: { uri: string };
    };
    expect(parsed.ok).toBe(true);
    expect(parsed.data.uri).toMatch(/^vscode:\/\/file\//);
    expect(parsed.data.uri).toContain('nota-x.html');
    await server.close();
  });
});

it('rejects traversal-like refs', async () => {
  await withVaultCopy(async (vaultRoot) => {
    const token = 'vscode-uri-bad';
    const server = createGavetaServer({ vaultRoot, port: 0, token });
    const address = await server.listen();
    const response = await requestLocal(
      address.port,
      '/api/note/vscode-uri?ref=..%2F..%2Fetc%2Fpasswd',
      authHeaders(token, address.port),
      'GET',
    );
    expect(response.status).toBeGreaterThanOrEqual(400);
    await server.close();
  });
});
