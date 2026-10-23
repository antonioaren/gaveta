import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { initVault, normalizeNote, parseGavetaNavigateMessage } from '@gaveta/core';
import { chromium, type Browser } from 'playwright';
import { afterAll, afterEach, beforeAll, expect, it } from 'vitest';
import { GAVETA_BIN, parseJson } from './helpers.ts';
import { requestLocal } from './serve-http.ts';

declare global {
  interface Window {
    __gavetaNav: unknown;
  }
}

const NOTE_ID = '01JB7Z3K9QX4T5M2N8V6R0WYHC';
const TARGET_REF = '01JB7Z3K9QX4T5M2N8V6R0WYHD';
const CREATED = '2026-10-22T12:00:00.000Z';

const children: ReturnType<typeof spawn>[] = [];
let browser: Browser;

function buildRenderNoteHtml(): string {
  const body = [
    '<article>',
    '<h1>Render iframe</h1>',
    '<pre class="mermaid">graph LR\n  A[Entrada] --> B[Salida]</pre>',
    `<p><a data-g-to="${TARGET_REF}" rel="related">Ir</a></p>`,
    '</article>',
  ].join('');
  const shell = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Render iframe</title><meta name="gaveta:id" content="${NOTE_ID}"><meta name="gaveta:type" content="doc"><meta name="gaveta:created" content="${CREATED}"></head><body>${body}</body></html>`;
  const normalized = normalizeNote(shell, { notePath: 'render-iframe.html' });
  if (!normalized.ok || normalized.html === null) {
    throw new Error('failed to normalize render iframe fixture');
  }
  return normalized.html;
}

async function startServe(vault: string): Promise<{ port: number; token: string }> {
  const child = spawn(process.execPath, [GAVETA_BIN, 'serve', '--json', '--port', '0'], {
    cwd: vault,
    env: { ...process.env, GAVETA_VAULT: vault },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  children.push(child);
  let stdout = '';
  let settled = false;
  return await new Promise((resolve, reject) => {
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

beforeAll(async () => {
  browser = await chromium.launch();
}, 120_000);

afterAll(async () => {
  await browser.close();
});

afterEach(() => {
  for (const child of children.splice(0)) {
    child.kill('SIGTERM');
  }
});

it('runs mermaid and posts gaveta:navigate from a sandboxed allow-scripts iframe', async () => {
  const parent = mkdtempSync(join(tmpdir(), 'gaveta-render-iframe-'));
  const vault = join(parent, 'vault');
  try {
    mkdirSync(vault, { recursive: true });
    await initVault({ cwd: vault });
    writeFileSync(join(vault, 'render-iframe.html'), buildRenderNoteHtml(), 'utf8');
    const started = await startServe(vault);
    const ticket = await fetchRenderTicket(started.port, started.token, NOTE_ID);
    const shellOrigin = `http://127.0.0.1:${String(started.port)}`;
    const renderUrl = `${shellOrigin}/render/${NOTE_ID}?t=${encodeURIComponent(ticket)}`;
    const page = await browser.newPage();
    await page.goto(`${shellOrigin}/`, { waitUntil: 'domcontentloaded' });
    await page.evaluate(
      ({ iframeSrc }) => {
        document.body.innerHTML = '';
        const iframe = document.createElement('iframe');
        iframe.id = 'gaveta-render';
        iframe.setAttribute('sandbox', 'allow-scripts');
        iframe.src = iframeSrc;
        document.body.appendChild(iframe);
        window.__gavetaNav = null;
        window.addEventListener('message', (event) => {
          const frame = document.getElementById('gaveta-render');
          if (frame instanceof HTMLIFrameElement) {
            const childWindow = frame.contentWindow;
            if (childWindow !== null && event.source !== childWindow) {
              return;
            }
          }
          window.__gavetaNav = event.data;
        });
      },
      { iframeSrc: renderUrl },
    );
    const frame = page.frameLocator('#gaveta-render');
    await frame.locator('pre.mermaid svg').waitFor({ timeout: 30_000 });
    await frame.locator(`a[data-g-to="${TARGET_REF}"]`).click();
    await page.waitForFunction(() => {
      const payload = window.__gavetaNav;
      return (
        payload !== null &&
        typeof payload === 'object' &&
        (payload as { type?: string }).type === 'gaveta:navigate'
      );
    });
    const payload: unknown = await page.evaluate((): unknown => window.__gavetaNav);
    expect(parseGavetaNavigateMessage(payload)).toEqual({
      type: 'gaveta:navigate',
      ref: TARGET_REF,
    });
    await page.close();
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
}, 120_000);
