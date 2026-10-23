import { spawn } from 'node:child_process';
import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { vaultPath } from '@gaveta/fixtures';
import { afterEach, expect, it } from 'vitest';
import { GAVETA_BIN, parseJson } from './helpers.ts';
import { requestLocal } from './serve-http.ts';

const children: ReturnType<typeof spawn>[] = [];

afterEach(() => {
  for (const child of children.splice(0)) {
    child.kill('SIGTERM');
  }
});

function startServe(vault: string): Promise<{ port: number; token: string }> {
  const child = spawn(process.execPath, [GAVETA_BIN, 'serve', '--json', '--port', '0'], {
    cwd: vault,
    env: { ...process.env, GAVETA_VAULT: vault },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  children.push(child);
  let stdout = '';
  let settled = false;
  return new Promise((resolve, reject) => {
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
      if (!settled && stdout.includes('"schemaVersion"')) {
        settled = true;
        const json = parseJson(stdout) as { data: { port: number; token: string } };
        resolve({ port: json.data.port, token: json.data.token });
      }
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (!settled && code !== 0) {
        reject(new Error(`serve failed: ${String(code)}`));
      }
    });
  });
}

async function fetchRenderTicket(port: number, token: string, noteId: string): Promise<string> {
  const response = await requestLocal(port, `/api/render-ticket?id=${encodeURIComponent(noteId)}`, {
    'x-gaveta-token': token,
  });
  expect(response.status).toBe(200);
  const payload = JSON.parse(response.body) as { data: { ticket: string } };
  return payload.data.ticket;
}

it('REQ-SEC-01: render route blocks XSS payloads from fixture notes', async () => {
  const parent = mkdtempSync(join(tmpdir(), 'gaveta-render-e2e-'));
  const vault = join(parent, 'vault');
  cpSync(vaultPath('malicious'), vault, { recursive: true });
  try {
    const started = await startServe(vault);
    const noteId = '01M5HGV8800000000000000012';
    const ticket = await fetchRenderTicket(started.port, started.token, noteId);
    const response = await requestLocal(
      started.port,
      `/render/${noteId}?t=${encodeURIComponent(ticket)}`,
    );
    expect(response.status).toBe(200);
    expect(response.body).not.toContain('onerror=');
    const body = response.body.slice(
      response.body.indexOf('<body>') + '<body>'.length,
      response.body.indexOf('</body>'),
    );
    expect(body).not.toMatch(/<script(?:\s|>)/iu);
    const csp = String(response.headers['content-security-policy'] ?? '');
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("frame-ancestors 'self'");
    expect(response.headers['x-frame-options']).toBeUndefined();
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

it('REQ-APP-02: render serves themed HTML with a short-lived ticket', async () => {
  const parent = mkdtempSync(join(tmpdir(), 'gaveta-render-themed-'));
  const vault = join(parent, 'vault');
  cpSync(vaultPath('backlinks'), vault, { recursive: true });
  try {
    const started = await startServe(vault);
    const notes = await requestLocal(started.port, '/api/notes', {
      'x-gaveta-token': started.token,
    });
    const payload = JSON.parse(notes.body) as {
      data: { notes: { id: string }[] };
    };
    expect(payload.data.notes.length).toBeGreaterThan(0);
    const id = payload.data.notes[0].id;
    const ticket = await fetchRenderTicket(started.port, started.token, id);
    const render = await requestLocal(
      started.port,
      `/render/${id}?t=${encodeURIComponent(ticket)}`,
    );
    expect(render.status).toBe(200);
    expect(render.body).toContain(`t=${encodeURIComponent(ticket)}`);
    expect(render.body).toContain('/render/static/theme.css');
    expect(render.body).toContain('/render/static/render-bridge.js');
    const sessionOnly = await requestLocal(started.port, `/render/${id}`, {
      'x-gaveta-token': started.token,
    });
    expect(sessionOnly.status).toBe(401);
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});
