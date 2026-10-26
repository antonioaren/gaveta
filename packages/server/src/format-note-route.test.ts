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

it('formats note HTML with the core normalizer', async () => {
  await withVaultCopy(async (vaultRoot) => {
    const token = 'format-note';
    const server = createGavetaServer({ vaultRoot, port: 0, token });
    const address = await server.listen();
    const messy =
      '<!doctype html><html><head><meta charset="utf-8"><title>T</title><meta name="gaveta:id" content="01JB7Z3K9QX4T5M2N8V6R0WYHE"><meta name="gaveta:type" content="doc"><meta name="gaveta:created" content="2026-10-22T12:00:00.000Z"></head><body><article><h1>T</h1><p>x</p></article></body></html>';
    const response = await requestLocal(
      address.port,
      '/api/format-note',
      authHeaders(token, address.port),
      'POST',
      JSON.stringify({ html: messy, path: 'nota.html' }),
    );
    expect(response.status).toBe(200);
    const parsed = JSON.parse(response.body) as {
      ok: boolean;
      data: { ok: boolean; html: string };
    };
    expect(parsed.ok).toBe(true);
    expect(parsed.data.ok).toBe(true);
    expect(parsed.data.html).toContain('<article>');
    const again = await requestLocal(
      address.port,
      '/api/format-note',
      authHeaders(token, address.port),
      'POST',
      JSON.stringify({ html: parsed.data.html, path: 'nota.html' }),
    );
    const second = JSON.parse(again.body) as { data: { html: string } };
    expect(second.data.html).toBe(parsed.data.html);
    await server.close();
  });
});
