import { spawn } from 'node:child_process';
import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, type Browser } from 'playwright';
import { afterAll, afterEach, beforeAll, expect, it } from 'vitest';
import { GAVETA_BIN, parseJson, type JsonEnvelope, newWebPage } from './helpers.ts';

const REPO_ROOT = join(import.meta.dirname, '..');
const BACKLINKS = join(REPO_ROOT, 'fixtures/vaults/backlinks');
const ENLACE_01_ID = '01M5HGV8800000000000000004';

const children: ReturnType<typeof spawn>[] = [];
let browser: Browser;

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

it('REQ-GRAPH-04: global graph filters and opens a note by ULID', async () => {
  const parent = mkdtempSync(join(tmpdir(), 'gaveta-e2e-web-graph-'));
  const vault = join(parent, 'vault');
  cpSync(BACKLINKS, vault, { recursive: true });
  try {
    const started = await startServe(vault);
    expect(started.json.ok).toBe(true);
    const { url } = started.json.data;

    const page = await newWebPage(browser);
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.goto(new URL('/grafo', url).toString(), { waitUntil: 'networkidle' });

    await page.getByRole('heading', { name: 'Grafo global' }).waitFor({ state: 'visible' });
    await page.getByText(/\d+ nodos ·/).waitFor({ state: 'visible' });
    const carpeta = page.getByLabel('Carpeta');
    await carpeta.locator('option[value="enlaces"]').waitFor({ state: 'attached' });
    await carpeta.selectOption('enlaces');
    await page.getByText(/\d+ nodos ·/).waitFor({ state: 'visible' });
    await page.getByRole('img', { name: 'Grafo global del vault' }).waitFor({ state: 'visible' });

    const node = page.getByRole('button', { name: 'Enlace 01' });
    await node.waitFor({ state: 'visible' });
    await node.click();

    await page.waitForURL(`**/nota/${ENLACE_01_ID}`);
    expect(page.url()).toContain(ENLACE_01_ID);

    await page.close();
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
}, 120_000);
