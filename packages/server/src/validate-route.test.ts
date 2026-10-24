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

it('returns validator diagnostics for note HTML', async () => {
  await withVaultCopy(async (vaultRoot) => {
    const token = 'validate-note';
    const server = createGavetaServer({ vaultRoot, port: 0, token });
    const address = await server.listen();
    const response = await requestLocal(
      address.port,
      '/api/validate',
      authHeaders(token, address.port),
      'POST',
      JSON.stringify({
        html: '<!doctype html><html><head><meta charset="utf-8"></head><body><script>x</script></body></html>',
        path: 'nota-x.html',
      }),
    );
    expect(response.status).toBe(200);
    const parsed = JSON.parse(response.body) as {
      ok: boolean;
      data: { ok: boolean; errorCount: number; diagnostics: { code: string }[] };
    };
    expect(parsed.ok).toBe(true);
    expect(parsed.data.ok).toBe(false);
    expect(parsed.data.errorCount).toBeGreaterThan(0);
    expect(
      parsed.data.diagnostics.some((diagnostic) => diagnostic.code.startsWith('E_UNSAFE')),
    ).toBe(true);
    await server.close();
  });
});
