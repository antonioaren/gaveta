import { initVault, normalizeNote, openVaultIndex } from '@gaveta/core';
import { vaultPath } from '@gaveta/fixtures';
import { cpSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { buildNoteRenderCsp } from '@gaveta/core';
import { GAVETA_TOKEN_HEADER, createGavetaServer } from './index.ts';
import { requestLocal } from './http-test.ts';
import { createRenderTicket, RENDER_TICKET_TTL_SECONDS } from './render-ticket.ts';

const NOTE_ID = '01M5HGV8800000000000000011';
const OTHER_ID = '01M5HGV8800000000000000012';
const RENDER_SECRET = 'render-hmac-secret-for-unit-tests!!';
const SESSION_TOKEN = 'session-token-for-unit-tests!!!!!!';

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

it('transcludes gaveta-embed sections in render output (REQ-LINK-13)', async () => {
  const parent = mkdtempSync(join(tmpdir(), 'gaveta-render-embed-'));
  const vaultRoot = join(parent, 'vault');
  cpSync(vaultPath('backlinks'), vaultRoot, { recursive: true });
  const hostId = '01M5HGV8800000000000000030';
  const embedHtml = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Host embed</title><meta name="gaveta:id" content="${hostId}"><meta name="gaveta:type" content="doc"><meta name="gaveta:created" content="2026-10-22T10:00:00Z"><link rel="stylesheet" href=".gaveta/theme.css"></head><body><article><h1>Host embed</h1><section id="intro"><gaveta-embed data-g-to="01M5HGV8800000000000000002" data-g-section="resumen"></gaveta-embed></section></article></body></html>`;
  writeFileSync(join(vaultRoot, 'host-embed.html'), embedHtml, 'utf8');
  const index = await openVaultIndex(vaultRoot);
  await index.rebuild();
  index.close();
  const server = createGavetaServer({
    vaultRoot,
    port: 0,
    token: SESSION_TOKEN,
    renderTicketSecret: RENDER_SECRET,
  });
  const address = await server.listen();
  try {
    const ticket = await fetchRenderTicket(address.port, SESSION_TOKEN, hostId);
    const response = await requestLocal(address.port, renderPath(hostId, ticket));
    expect(response.status).toBe(200);
    expect(response.body).not.toMatch(/<gaveta-embed\b/u);
    expect(response.body).toContain('Destino de las formas de enlace');
  } finally {
    await server.close();
    rmSync(parent, { recursive: true, force: true });
  }
});

it('serves render HTML with a strict CSP header when the render ticket is valid', async () => {
  await withMaliciousVault(async (vaultRoot) => {
    const server = createGavetaServer({
      vaultRoot,
      port: 0,
      token: SESSION_TOKEN,
      renderTicketSecret: RENDER_SECRET,
    });
    const address = await server.listen();
    const ticket = await fetchRenderTicket(address.port, SESSION_TOKEN, NOTE_ID);
    const response = await requestLocal(address.port, renderPath(NOTE_ID, ticket));
    expect(response.status).toBe(200);
    const csp = String(response.headers['content-security-policy'] ?? '');
    expect(csp).toBe(buildNoteRenderCsp(address.port));
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'self'");
    expect(response.headers['x-frame-options']).toBeUndefined();
    expect(String(response.headers['cross-origin-resource-policy']).toLowerCase()).toBe(
      'cross-origin',
    );
    expect(response.body).not.toContain('alert(1)');
    await server.close();
  });
});

it('rejects render without a ticket, with session token only, or with token in the query', async () => {
  await withMaliciousVault(async (vaultRoot) => {
    const server = createGavetaServer({
      vaultRoot,
      port: 0,
      token: SESSION_TOKEN,
      renderTicketSecret: RENDER_SECRET,
    });
    const address = await server.listen();

    const missingTicket = await requestLocal(address.port, `/render/${NOTE_ID}`);
    expect(missingTicket.status).toBe(401);

    const sessionOnly = await requestLocal(
      address.port,
      `/render/${NOTE_ID}`,
      authHeaders(SESSION_TOKEN),
    );
    expect(sessionOnly.status).toBe(401);

    const tokenInQuery = await requestLocal(
      address.port,
      `/render/${NOTE_ID}?token=${encodeURIComponent(SESSION_TOKEN)}`,
    );
    expect(tokenInQuery.status).toBe(401);

    await server.close();
  });
});

it('rejects expired or mismatched render tickets', async () => {
  await withMaliciousVault(async (vaultRoot) => {
    const server = createGavetaServer({
      vaultRoot,
      port: 0,
      token: SESSION_TOKEN,
      renderTicketSecret: RENDER_SECRET,
    });
    const address = await server.listen();
    const issued = Date.now();
    const expired = createRenderTicket(
      RENDER_SECRET,
      NOTE_ID,
      issued - (RENDER_TICKET_TTL_SECONDS + 5) * 1000,
    );
    const expiredResponse = await requestLocal(address.port, renderPath(NOTE_ID, expired));
    expect(expiredResponse.status).toBe(401);

    const valid = createRenderTicket(RENDER_SECRET, NOTE_ID, issued);
    const wrongNote = await requestLocal(address.port, renderPath(OTHER_ID, valid));
    expect(wrongNote.status).toBe(401);

    await server.close();
  });
});

it('rejects traversal-like render ids and unknown notes', async () => {
  await withMaliciousVault(async (vaultRoot) => {
    const server = createGavetaServer({
      vaultRoot,
      port: 0,
      token: SESSION_TOKEN,
      renderTicketSecret: RENDER_SECRET,
    });
    const address = await server.listen();
    const ticket = await fetchRenderTicket(address.port, SESSION_TOKEN, NOTE_ID);
    const traversal = await requestLocal(
      address.port,
      `/render/${encodeURIComponent('../../../etc/passwd')}?t=${encodeURIComponent(ticket)}`,
    );
    expect(traversal.status).toBe(400);

    const missingId = '01JB7Z3K9QX4T5M2N8V6R0WYHD';
    const missingTicket = createRenderTicket(RENDER_SECRET, missingId);
    const missing = await requestLocal(address.port, renderPath(missingId, missingTicket));
    expect(missing.status).toBe(404);
    await server.close();
  });
});

it('issues render tickets only to authenticated API clients', async () => {
  await withMaliciousVault(async (vaultRoot) => {
    const server = createGavetaServer({
      vaultRoot,
      port: 0,
      token: SESSION_TOKEN,
      renderTicketSecret: RENDER_SECRET,
    });
    const address = await server.listen();
    const unauth = await requestLocal(
      address.port,
      `/api/render-ticket?id=${encodeURIComponent(NOTE_ID)}`,
    );
    expect(unauth.status).toBe(401);
    await server.close();
  });
});

it('rejects render tickets signed with the session token instead of the render secret', async () => {
  await withMaliciousVault(async (vaultRoot) => {
    const server = createGavetaServer({
      vaultRoot,
      port: 0,
      token: SESSION_TOKEN,
      renderTicketSecret: RENDER_SECRET,
    });
    const address = await server.listen();
    const forged = createRenderTicket(SESSION_TOKEN, NOTE_ID);
    const response = await requestLocal(address.port, renderPath(NOTE_ID, forged));
    expect(response.status).toBe(401);
    await server.close();
  });
});

it('serves only note-referenced attachment files with sandboxed file headers', async () => {
  const parent = mkdtempSync(join(tmpdir(), 'gaveta-render-files-'));
  const vaultRoot = join(parent, 'vault');
  mkdirSync(vaultRoot, { recursive: true });
  await initVault({ cwd: vaultRoot });
  mkdirSync(join(vaultRoot, 'attachments'), { recursive: true });
  writeFileSync(join(vaultRoot, 'attachments', 'pixel.png'), 'PNG', 'utf8');
  writeFileSync(join(vaultRoot, 'attachments', 'secret.png'), 'SECRET', 'utf8');
  const shell = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Img</title><meta name="gaveta:id" content="01JB7Z3K9QX4T5M2N8V6R0WYHC"><meta name="gaveta:type" content="doc"><meta name="gaveta:created" content="2026-10-22T12:00:00Z"></head><body><p><img src="attachments/pixel.png" alt=""></p></body></html>`;
  const normalized = normalizeNote(shell, { notePath: 'img.html' });
  if (!normalized.ok || normalized.html === null) {
    throw new Error('normalize failed');
  }
  writeFileSync(join(vaultRoot, 'img.html'), normalized.html, 'utf8');
  const index = await openVaultIndex(vaultRoot);
  await index.rebuild();
  index.close();
  const server = createGavetaServer({
    vaultRoot,
    port: 0,
    token: SESSION_TOKEN,
    renderTicketSecret: RENDER_SECRET,
  });
  try {
    const address = await server.listen();
    const ticket = await fetchRenderTicket(
      address.port,
      SESSION_TOKEN,
      '01JB7Z3K9QX4T5M2N8V6R0WYHC',
    );
    const allowed = await requestLocal(
      address.port,
      `/render/01JB7Z3K9QX4T5M2N8V6R0WYHC/file/attachments/pixel.png?t=${encodeURIComponent(ticket)}`,
    );
    expect(allowed.status).toBe(200);
    expect(allowed.headers['content-security-policy']).toBe("default-src 'none'; sandbox");
    expect(allowed.headers['content-disposition']).toContain('inline');

    const secretFile = await requestLocal(
      address.port,
      `/render/01JB7Z3K9QX4T5M2N8V6R0WYHC/file/attachments/secret.png?t=${encodeURIComponent(ticket)}`,
    );
    expect(secretFile.status).toBe(400);

    const gaveta = await requestLocal(
      address.port,
      `/render/01JB7Z3K9QX4T5M2N8V6R0WYHC/file/.gaveta/config.json?t=${encodeURIComponent(ticket)}`,
    );
    expect(gaveta.status).toBe(400);
  } finally {
    await server.close();
    rmSync(parent, { recursive: true, force: true });
  }
});

it('does not serve attachment symlinks that escape the vault', async () => {
  const parent = mkdtempSync(join(tmpdir(), 'gaveta-render-symlink-'));
  const vaultRoot = join(parent, 'vault');
  const outside = join(parent, 'outside.png');
  writeFileSync(outside, 'OUT', 'utf8');
  mkdirSync(vaultRoot, { recursive: true });
  await initVault({ cwd: vaultRoot });
  mkdirSync(join(vaultRoot, 'attachments'), { recursive: true });
  symlinkSync(outside, join(vaultRoot, 'attachments', 'leak.png'));
  const shell = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Img</title><meta name="gaveta:id" content="01JB7Z3K9QX4T5M2N8V6R0WYHC"><meta name="gaveta:type" content="doc"><meta name="gaveta:created" content="2026-10-22T12:00:00Z"></head><body><p><img src="attachments/leak.png" alt=""></p></body></html>`;
  const normalized = normalizeNote(shell, { notePath: 'img.html' });
  if (!normalized.ok || normalized.html === null) {
    throw new Error('normalize failed');
  }
  writeFileSync(join(vaultRoot, 'img.html'), normalized.html, 'utf8');
  const leakIndex = await openVaultIndex(vaultRoot);
  await leakIndex.rebuild();
  leakIndex.close();
  const server = createGavetaServer({
    vaultRoot,
    port: 0,
    token: SESSION_TOKEN,
    renderTicketSecret: RENDER_SECRET,
  });
  try {
    const address = await server.listen();
    const ticket = await fetchRenderTicket(
      address.port,
      SESSION_TOKEN,
      '01JB7Z3K9QX4T5M2N8V6R0WYHC',
    );
    const response = await requestLocal(
      address.port,
      `/render/01JB7Z3K9QX4T5M2N8V6R0WYHC/file/attachments/leak.png?t=${encodeURIComponent(ticket)}`,
    );
    expect(response.status).toBe(400);
  } finally {
    await server.close();
    rmSync(parent, { recursive: true, force: true });
  }
});

it('requires a render ticket even when the path is encoded or has collapsed slashes', async () => {
  await withMaliciousVault(async (vaultRoot) => {
    const server = createGavetaServer({
      vaultRoot,
      port: 0,
      token: SESSION_TOKEN,
      renderTicketSecret: RENDER_SECRET,
    });
    const address = await server.listen();
    const sessionOnly = await requestLocal(
      address.port,
      `//render/${NOTE_ID}`,
      authHeaders(SESSION_TOKEN),
    );
    expect(sessionOnly.status).toBe(401);

    const encoded = await requestLocal(
      address.port,
      `/%72ender/${NOTE_ID}`,
      authHeaders(SESSION_TOKEN),
    );
    expect(encoded.status).toBe(401);

    await server.close();
  });
});
