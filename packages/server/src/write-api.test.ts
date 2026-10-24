import { ABSENT_NOTE_HASH, noteContentHash, readVaultText } from '@gaveta/core';
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

function postJson(
  port: number,
  path: string,
  token: string,
  body: Record<string, unknown>,
  ifMatch?: string,
): Promise<{ status: number; body: string }> {
  const headers = {
    ...authHeaders(token, port),
    ...(ifMatch === undefined ? {} : { 'if-match': ifMatch }),
  };
  return requestLocal(port, path, headers, 'POST', JSON.stringify(body));
}

function envelope(body: string): {
  ok: boolean;
  data?: Record<string, unknown>;
  error?: { code: string; details?: Record<string, unknown> };
} {
  return JSON.parse(body) as {
    ok: boolean;
    data?: Record<string, unknown>;
    error?: { code: string; details?: Record<string, unknown> };
  };
}

async function noteHash(port: number, token: string, ref: string): Promise<string> {
  const response = await requestLocal(
    port,
    `/api/read?ref=${encodeURIComponent(ref)}&as=html`,
    authHeaders(token, port),
  );
  const parsed = envelope(response.body);
  expect(parsed.ok).toBe(true);
  return String(parsed.data?.hash);
}

it('returns 428 when If-Match is missing on edit', async () => {
  await withVaultCopy(async (vaultRoot) => {
    const token = 'if-match-missing';
    const server = createGavetaServer({ vaultRoot, port: 0, token });
    const address = await server.listen();
    const response = await postJson(address.port, '/api/edit', token, {
      ref: 'Nota X',
      mode: 'replace',
      html: '<p>x</p>',
    });
    expect(response.status).toBe(428);
    expect(envelope(response.body).error?.code).toBe('E_IF_MATCH_REQUIRED');
    await server.close();
  });
});

it('returns 409 with the current hash when If-Match is stale', async () => {
  await withVaultCopy(async (vaultRoot) => {
    const token = 'if-match-stale';
    const server = createGavetaServer({ vaultRoot, port: 0, token });
    const address = await server.listen();
    const hash = await noteHash(address.port, token, 'Nota X');
    const stale = noteContentHash('contenido desfasado');
    const response = await postJson(
      address.port,
      '/api/edit',
      token,
      { ref: 'Nota X', mode: 'replace', html: '<p>cambio</p>' },
      stale,
    );
    expect(response.status).toBe(409);
    const parsed = envelope(response.body);
    expect(parsed.error?.code).toBe('E_CONFLICT');
    expect(parsed.error?.details?.hash).toBe(hash);
    await server.close();
  });
});

it('rejects unknown JSON keys on write bodies', async () => {
  await withVaultCopy(async (vaultRoot) => {
    const token = 'unknown-keys';
    const server = createGavetaServer({ vaultRoot, port: 0, token });
    const address = await server.listen();
    const response = await postJson(
      address.port,
      '/api/new',
      token,
      { title: 'X', type: 'doc', extra: true },
      ABSENT_NOTE_HASH,
    );
    expect(response.status).toBe(400);
    await server.close();
  });
});

it('rejects traversal-like refs without leaking paths', async () => {
  await withVaultCopy(async (vaultRoot) => {
    const token = 'traversal-write';
    const server = createGavetaServer({ vaultRoot, port: 0, token });
    const address = await server.listen();
    const response = await postJson(
      address.port,
      '/api/edit',
      token,
      { ref: '../../../etc/passwd', mode: 'replace', html: '<p>x</p>' },
      ABSENT_NOTE_HASH,
    );
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.body).not.toContain('/etc/passwd');
    await server.close();
  });
});

it('creates a note when If-Match is the absent sentinel', async () => {
  await withVaultCopy(async (vaultRoot) => {
    const token = 'create-note';
    const server = createGavetaServer({ vaultRoot, port: 0, token });
    const address = await server.listen();
    const response = await postJson(
      address.port,
      '/api/new',
      token,
      { title: 'API Nueva', type: 'doc', in: 'api-creadas' },
      ABSENT_NOTE_HASH,
    );
    expect(response.status).toBe(200);
    const parsed = envelope(response.body);
    expect(parsed.ok).toBe(true);
    expect(parsed.data?.path).toBe('api-creadas/api-nueva.html');
    const html = await readVaultText(vaultRoot, String(parsed.data?.path));
    expect(html).toContain('API Nueva');
    await server.close();
  });
});

it('edits a full document without changing bytes when html is unchanged', async () => {
  await withVaultCopy(async (vaultRoot) => {
    const token = 'edit-document';
    const server = createGavetaServer({ vaultRoot, port: 0, token });
    const address = await server.listen();
    const hash = await noteHash(address.port, token, 'Nota X');
    const html = await readVaultText(vaultRoot, 'nota-x.html');
    const response = await postJson(
      address.port,
      '/api/edit',
      token,
      { ref: 'Nota X', mode: 'replace', scope: 'document', html },
      hash,
    );
    expect(response.status).toBe(200);
    const after = await readVaultText(vaultRoot, 'nota-x.html');
    expect(after).toBe(html);
    await server.close();
  });
});

it('edits a note section with a matching hash', async () => {
  await withVaultCopy(async (vaultRoot) => {
    const token = 'edit-note';
    const server = createGavetaServer({ vaultRoot, port: 0, token });
    const address = await server.listen();
    const hash = await noteHash(address.port, token, 'Nota X');
    const response = await postJson(
      address.port,
      '/api/edit',
      token,
      {
        ref: 'Nota X',
        mode: 'append',
        section: 'resumen',
        html: '<p>apéndice api</p>',
      },
      hash,
    );
    expect(response.status).toBe(200);
    const html = await readVaultText(vaultRoot, 'nota-x.html');
    expect(html).toContain('apéndice api');
    await server.close();
  });
});
