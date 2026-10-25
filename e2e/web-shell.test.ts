import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { initVault as initVaultCore, normalizeNote, writeAtomic } from '@gaveta/core';
import { chromium, type Browser } from 'playwright';
import { afterAll, afterEach, beforeAll, expect, it } from 'vitest';
import {
  GAVETA_BIN,
  initVault,
  newWebPage,
  parseJson,
  withTempVaultAsync,
  type JsonEnvelope,
} from './helpers.ts';

const REPO_ROOT = join(import.meta.dirname, '..');
const LIVE_NOTE_ID = '01JB7Z3K9QX4T5M2N8V6R0WYHE';
const LIVE_NOTE_CREATED = '2026-10-22T12:00:00.000Z';
const children: ReturnType<typeof spawn>[] = [];
let browser: Browser;

function buildLiveShellNoteHtml(bodyParagraph: string): string {
  const body = [
    '<article>',
    '<h1>Reload probe</h1>',
    `<section id="cuerpo"><p id="live-probe">${bodyParagraph}</p></section>`,
    '</article>',
  ].join('');
  const shell = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Reload probe</title><meta name="gaveta:id" content="${LIVE_NOTE_ID}"><meta name="gaveta:type" content="doc"><meta name="gaveta:created" content="${LIVE_NOTE_CREATED}"></head><body>${body}</body></html>`;
  const normalized = normalizeNote(shell, { notePath: 'reload-probe.html' });
  if (!normalized.ok || normalized.html === null) {
    throw new Error('failed to normalize live shell fixture');
  }
  return normalized.html;
}

beforeAll(async () => {
  const { execFileSync } = await import('node:child_process');
  execFileSync('pnpm', ['build:web'], { cwd: REPO_ROOT, stdio: 'inherit' });
  browser = await chromium.launch();
}, 180_000);

afterAll(async () => {
  await browser.close();
});

afterEach(() => {
  for (const child of children.splice(0)) {
    child.kill('SIGTERM');
  }
});

function startServe(vault: string): Promise<{
  json: JsonEnvelope<{ port: number; token: string; url: string }>;
}> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [GAVETA_BIN, 'serve', '--json', '--port', '0'], {
      cwd: vault,
      env: { ...process.env, GAVETA_VAULT: vault },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    children.push(child);
    let stdout = '';
    let settled = false;
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
      if (!settled && stdout.includes('"schemaVersion"')) {
        settled = true;
        try {
          resolve({ json: parseJson(stdout) });
        } catch (error) {
          reject(error instanceof Error ? error : new Error(String(error)));
        }
      }
    });
    child.stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf8');
      if (text.length > 0 && !settled) {
        reject(new Error(text));
      }
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (!settled && code !== 0) {
        reject(new Error(`serve exited with ${String(code)}`));
      }
    });
  });
}

it('REQ-APP-01 / REQ-SEC-06: gaveta serve loads the viewer shell and bootstraps the token', async () => {
  await withTempVaultAsync(async (vault) => {
    initVault(vault);
    const started = await startServe(vault);
    expect(started.json.ok).toBe(true);
    const { url, token } = started.json.data;

    const page = await newWebPage(browser);
    const errors: string[] = [];
    page.on('pageerror', (error) => {
      errors.push(error.message);
    });
    await page.goto(url, { waitUntil: 'networkidle' });
    expect(page.url()).not.toContain('token=');

    await page
      .getByRole('navigation', { name: 'Explorador de notas' })
      .waitFor({ state: 'visible' });
    await page.getByLabel('Panel de conexiones').waitFor({ state: 'visible' });
    await page.getByRole('heading', { name: 'Conexiones' }).waitFor({ state: 'visible' });

    const notesResponse = await page.evaluate(async (headerToken) => {
      const response = await fetch('/api/notes', {
        headers: { 'x-gaveta-token': headerToken },
      });
      return response.status;
    }, token);
    expect(notesResponse).toBe(200);
    expect(errors).toEqual([]);
    await page.close();
  });
}, 120_000);

it('T2.2: editing a note on disk reloads the shell render iframe', async () => {
  const parent = mkdtempSync(join(tmpdir(), 'gaveta-web-shell-live-'));
  const vault = join(parent, 'vault');
  try {
    mkdirSync(vault, { recursive: true });
    await initVaultCore({ cwd: vault });
    const notePath = join(vault, 'reload-probe.html');
    writeFileSync(notePath, buildLiveShellNoteHtml('before-live-edit'), 'utf8');
    const started = await startServe(vault);
    expect(started.json.ok).toBe(true);
    const { url } = started.json.data;

    const page = await newWebPage(browser);
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Reload probe' }).click();
    const frame = page.frameLocator('[data-testid="note-render-frame"]');
    const probe = frame.locator('#live-probe');
    await probe.waitFor({ state: 'visible', timeout: 30_000 });
    expect(await probe.innerText()).toBe('before-live-edit');

    await writeAtomic(notePath, buildLiveShellNoteHtml('after-live-edit'));
    await probe.filter({ hasText: 'after-live-edit' }).waitFor({ timeout: 30_000 });
    expect(await probe.innerText()).toBe('after-live-edit');
    await page.close();
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
}, 120_000);
