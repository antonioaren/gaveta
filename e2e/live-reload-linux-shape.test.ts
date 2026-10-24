import { spawn } from 'node:child_process';
import { cpSync, mkdtempSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeAtomic } from '@gaveta/core';
import { vaultPath } from '@gaveta/fixtures';
import { chromium, type Browser } from 'playwright';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { GAVETA_BIN, parseJson, runGaveta, type JsonEnvelope } from './helpers.ts';

const REPO_ROOT = join(import.meta.dirname, '..');
const children: ReturnType<typeof spawn>[] = [];
let browser: Browser;

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
  });
}

function copyBacklinksVault(): string {
  const parent = mkdtempSync(join(tmpdir(), 'gaveta-live-reload-'));
  const vault = join(parent, 'vault');
  cpSync(vaultPath('backlinks'), vault, { recursive: true });
  return vault;
}

async function openDestinoNote(page: import('playwright').Page, url: string): Promise<void> {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    Reflect.set(globalThis, '__gavetaLiveLog', []);
  });
  await page.getByRole('button', { name: 'Destino enlace' }).click();
  await page
    .frameLocator('[data-testid="note-render-frame"]')
    .locator('#resumen')
    .waitFor({ timeout: 30_000 });
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

describe('live iframe reload (Linux-shaped watcher)', () => {
  it('updates after unlink then add on the same note path', async () => {
    const vault = copyBacklinksVault();
    const started = await startServe(vault);
    const { url } = started.json.data;
    const page = await browser.newPage();
    await openDestinoNote(page, url);
    const frame = page.frameLocator('[data-testid="note-render-frame"]');
    const notePath = join(vault, 'destino-enlace.html');
    const marker = `linux-unlink-add-${String(Date.now())}`;
    const html = await import('node:fs/promises').then((fs) => fs.readFile(notePath, 'utf8'));
    const updated = html.replace(
      /<section id="resumen"[^>]*>[\s\S]*?<\/section>/,
      `<section id="resumen"><p id="linux-probe">${marker}</p></section>`,
    );
    unlinkSync(notePath);
    writeFileSync(notePath, updated, 'utf8');
    await frame.locator('#linux-probe').filter({ hasText: marker }).waitFor({ timeout: 30_000 });
    await page.close();
    rmSync(join(vault, '..'), { recursive: true, force: true });
  }, 120_000);

  it('shows the final marker after a rapid burst of CLI edits', async () => {
    const vault = copyBacklinksVault();
    const started = await startServe(vault);
    const { url } = started.json.data;
    const page = await browser.newPage();
    await openDestinoNote(page, url);
    const frame = page.frameLocator('[data-testid="note-render-frame"]');
    const finalMarker = `burst-final-${String(Date.now())}`;
    for (let index = 0; index < 5; index += 1) {
      const marker = index === 4 ? finalMarker : `burst-${String(index)}-${String(Date.now())}`;
      const edit = runGaveta(
        [
          'edit',
          'destino-enlace.html',
          '--section',
          'resumen',
          '--replace',
          '--from',
          '-',
          '--json',
        ],
        { vault, input: `<p id="burst-probe">${marker}</p>` },
      );
      expect(edit.status).toBe(0);
    }
    await frame
      .locator('#burst-probe')
      .filter({ hasText: finalMarker })
      .waitFor({ timeout: 90_000 });
    await page.close();
    rmSync(join(vault, '..'), { recursive: true, force: true });
  }, 180_000);

  it('updates after an atomic replace of the open note', async () => {
    const vault = copyBacklinksVault();
    const started = await startServe(vault);
    const { url } = started.json.data;
    const page = await browser.newPage();
    await openDestinoNote(page, url);
    const frame = page.frameLocator('[data-testid="note-render-frame"]');
    const notePath = join(vault, 'destino-enlace.html');
    const marker = `atomic-${String(Date.now())}`;
    const html = await import('node:fs/promises').then((fs) => fs.readFile(notePath, 'utf8'));
    const updated = html.replace(
      /<section id="resumen"[^>]*>[\s\S]*?<\/section>/,
      `<section id="resumen"><p id="atomic-probe">${marker}</p></section>`,
    );
    await writeAtomic(notePath, updated);
    await frame.locator('#atomic-probe').filter({ hasText: marker }).waitFor({ timeout: 30_000 });
    await page.close();
    rmSync(join(vault, '..'), { recursive: true, force: true });
  }, 120_000);
});
