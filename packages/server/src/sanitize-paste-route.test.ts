import { expect, it } from 'vitest';
import { API_WRITE_BODY_LIMIT_BYTES } from './constants.ts';
import { GAVETA_TOKEN_HEADER, createGavetaServer } from './index.ts';
import { requestLocal } from './http-test.ts';
import { withVaultCopy } from './test-helpers.ts';

function authHeaders(token: string, port: number): Record<string, string> {
  return {
    [GAVETA_TOKEN_HEADER]: token,
    host: `127.0.0.1:${String(port)}`,
  };
}

function postSanitize(
  port: number,
  token: string | undefined,
  body: Record<string, unknown>,
  extraHeaders: Record<string, string> = {},
): Promise<{ status: number; body: string }> {
  const headers = {
    ...(token === undefined ? {} : authHeaders(token, port)),
    ...extraHeaders,
  };
  return requestLocal(
    port,
    '/api/sanitize-paste',
    headers,
    'POST',
    JSON.stringify(body),
  );
}

it('requires a session token for POST /api/sanitize-paste', async () => {
  await withVaultCopy(async (vaultRoot) => {
    const token = 'sanitize-auth';
    const server = createGavetaServer({ vaultRoot, port: 0, token });
    const address = await server.listen();
    const response = await postSanitize(address.port, undefined, {
      html: '<p>hola</p>',
      notePath: 'nota-x.html',
    });
    expect(response.status).toBe(401);
    const parsed = JSON.parse(response.body) as { error: { code: string } };
    expect(parsed.error.code).toBe('E_AUTH_REQUIRED');
    await server.close();
  });
});

it('rejects a hostile Origin on POST /api/sanitize-paste', async () => {
  await withVaultCopy(async (vaultRoot) => {
    const token = 'sanitize-origin';
    const server = createGavetaServer({ vaultRoot, port: 0, token });
    const address = await server.listen();
    const response = await postSanitize(
      address.port,
      token,
      { html: '<p>x</p>', notePath: 'nota-x.html' },
      { origin: `http://evil.example:${String(address.port)}` },
    );
    expect(response.status).toBe(403);
    await server.close();
  });
});

it('rejects request bodies larger than the write API limit', async () => {
  await withVaultCopy(async (vaultRoot) => {
    const token = 'sanitize-body-limit';
    const server = createGavetaServer({ vaultRoot, port: 0, token });
    const address = await server.listen();
    const pad = 'x'.repeat(API_WRITE_BODY_LIMIT_BYTES);
    const oversized = JSON.stringify({ html: pad, notePath: 'nota-x.html' });
    expect(Buffer.byteLength(oversized)).toBeGreaterThan(API_WRITE_BODY_LIMIT_BYTES);
    const response = await requestLocal(
      address.port,
      '/api/sanitize-paste',
      authHeaders(token, address.port),
      'POST',
      oversized,
    );
    expect(response.status).toBe(413);
    await server.close();
  });
});

it('sanitizes paste HTML when authenticated', async () => {
  await withVaultCopy(async (vaultRoot) => {
    const token = 'sanitize-ok';
    const server = createGavetaServer({ vaultRoot, port: 0, token });
    const address = await server.listen();
    const response = await postSanitize(address.port, token, {
      html: '<p>pegado <strong>seguro</strong></p>',
      notePath: 'nota-x.html',
    });
    expect(response.status).toBe(200);
    const parsed = JSON.parse(response.body) as {
      ok: boolean;
      data: { html: string };
    };
    expect(parsed.ok).toBe(true);
    expect(parsed.data.html).toContain('pegado');
    expect(parsed.data.html).not.toContain('<script');
    await server.close();
  });
});
