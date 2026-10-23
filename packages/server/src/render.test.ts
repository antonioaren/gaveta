import { vaultPath } from '@gaveta/fixtures';
import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { buildNoteRenderCsp } from '@gaveta/core';
import { GAVETA_TOKEN_HEADER, createGavetaServer } from './index.ts';
import { requestLocal } from './http-test.ts';
import { createRenderTicket, RENDER_TICKET_TTL_SECONDS } from './render-ticket.ts';

const NOTE_ID = '01M5HGV8800000000000000011';
const OTHER_ID = '01M5HGV8800000000000000012';

function authHeaders(token: string): Record<string, string> {
  return {
    [GAVETA_TOKEN_HEADER]: token,
  };
}

async function withMaliciousVault(run: (vaultRoot: string) => Promise<void>): Promise<void> {
  const parent = mkdtempSync(join(tmpdir(), 'gaveta-render-'));
  const vaultRoot = join(parent, 'vault');
  cpSync(vaultPath('malicious'), vaultRoot, { recursive: true });
  try {
    await run(vaultRoot);
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
}

async function fetchRenderTicket(
  port: number,
  sessionToken: string,
  noteId: string,
): Promise<string> {
  const response = await requestLocal(
    port,
    `/api/render-ticket?id=${encodeURIComponent(noteId)}`,
    authHeaders(sessionToken),
  );
  expect(response.status).toBe(200);
  const payload = JSON.parse(response.body) as { data: { ticket: string } };
  return payload.data.ticket;
}

function renderPath(noteId: string, ticket: string): string {
  return `/render/${noteId}?t=${encodeURIComponent(ticket)}`;
}

it('serves render HTML with a strict CSP header when the render ticket is valid', async () => {
  await withMaliciousVault(async (vaultRoot) => {
    const token = 'render-csp-token';
    const server = createGavetaServer({ vaultRoot, port: 0, token });
    const address = await server.listen();
    const ticket = await fetchRenderTicket(address.port, token, NOTE_ID);
    const response = await requestLocal(address.port, renderPath(NOTE_ID, ticket));
    expect(response.status).toBe(200);
    const csp = String(response.headers['content-security-policy'] ?? '');
    expect(csp).toBe(buildNoteRenderCsp());
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'self'");
    expect(response.headers['x-frame-options']).toBeUndefined();
    expect(response.body).not.toContain('alert(1)');
    await server.close();
  });
});

it('rejects render without a ticket, with session token only, or with token in the query', async () => {
  await withMaliciousVault(async (vaultRoot) => {
    const token = 'render-auth-token';
    const server = createGavetaServer({ vaultRoot, port: 0, token });
    const address = await server.listen();

    const missingTicket = await requestLocal(address.port, `/render/${NOTE_ID}`);
    expect(missingTicket.status).toBe(401);

    const sessionOnly = await requestLocal(address.port, `/render/${NOTE_ID}`, authHeaders(token));
    expect(sessionOnly.status).toBe(401);

    const tokenInQuery = await requestLocal(
      address.port,
      `/render/${NOTE_ID}?token=${encodeURIComponent(token)}`,
    );
    expect(tokenInQuery.status).toBe(401);

    await server.close();
  });
});

it('rejects expired or mismatched render tickets', async () => {
  await withMaliciousVault(async (vaultRoot) => {
    const token = 'render-ticket-token';
    const server = createGavetaServer({ vaultRoot, port: 0, token });
    const address = await server.listen();
    const issued = Date.now();
    const expired = createRenderTicket(
      token,
      NOTE_ID,
      issued - (RENDER_TICKET_TTL_SECONDS + 5) * 1000,
    );
    const expiredResponse = await requestLocal(address.port, renderPath(NOTE_ID, expired));
    expect(expiredResponse.status).toBe(401);

    const valid = createRenderTicket(token, NOTE_ID, issued);
    const wrongNote = await requestLocal(address.port, renderPath(OTHER_ID, valid));
    expect(wrongNote.status).toBe(401);

    await server.close();
  });
});

it('rejects traversal-like render ids and unknown notes', async () => {
  await withMaliciousVault(async (vaultRoot) => {
    const token = 'render-traversal-token';
    const server = createGavetaServer({ vaultRoot, port: 0, token });
    const address = await server.listen();
    const ticket = await fetchRenderTicket(address.port, token, NOTE_ID);
    const traversal = await requestLocal(
      address.port,
      `/render/${encodeURIComponent('../../../etc/passwd')}?t=${encodeURIComponent(ticket)}`,
    );
    expect(traversal.status).toBe(400);

    const missingId = '01JB7Z3K9QX4T5M2N8V6R0WYHD';
    const missingTicket = createRenderTicket(token, missingId);
    const missing = await requestLocal(address.port, renderPath(missingId, missingTicket));
    expect(missing.status).toBe(404);
    await server.close();
  });
});

it('issues render tickets only to authenticated API clients', async () => {
  await withMaliciousVault(async (vaultRoot) => {
    const token = 'render-ticket-api-token';
    const server = createGavetaServer({ vaultRoot, port: 0, token });
    const address = await server.listen();
    const unauth = await requestLocal(
      address.port,
      `/api/render-ticket?id=${encodeURIComponent(NOTE_ID)}`,
    );
    expect(unauth.status).toBe(401);
    await server.close();
  });
});
