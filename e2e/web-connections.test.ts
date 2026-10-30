import { spawn } from 'node:child_process';
import { cpSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, type Browser } from 'playwright';
import { afterAll, afterEach, beforeAll, expect, it } from 'vitest';
import {
  ensureWebBuilt,
  GAVETA_BIN,
  newWebPage,
  parseJson,
  removeTempTree,
  stopServeChildren,
  type JsonEnvelope,
} from './helpers.ts';

const REPO_ROOT = join(import.meta.dirname, '..');
const BACKLINKS = join(REPO_ROOT, 'fixtures/vaults/backlinks');
const DESTINO_ID = '01M5HGV8800000000000000002';
const FORMAS_ID = '01M5HGV8800000000000000003';

const children: ReturnType<typeof spawn>[] = [];
let browser: Browser;

beforeAll(async () => {
  ensureWebBuilt();
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

it('REQ-APP-01: connections panel lists backlinks and navigates by ULID', async () => {
  const parent = mkdtempSync(join(tmpdir(), 'gaveta-e2e-web-connections-'));
  const vault = join(parent, 'vault');
  cpSync(BACKLINKS, vault, { recursive: true });
  try {
    const started = await startServe(vault);
    expect(started.json.ok).toBe(true);
    const { url } = started.json.data;

    const page = await newWebPage(browser);
    await page.goto(url, { waitUntil: 'networkidle' });
    const noteUrl = new URL(`/nota/${DESTINO_ID}`, url);
    await page.goto(noteUrl.toString(), { waitUntil: 'networkidle' });

    const panel = page.getByLabel('Panel de conexiones');
    await panel.locator('#connections-backlinks').waitFor({ state: 'visible' });
    const backlinkButton = panel
      .locator('.connections__list--backlinks')
      .getByRole('button', { name: 'Formas de enlace' });
    await backlinkButton.waitFor({ state: 'visible' });
    await panel.locator('#connections-outgoing').waitFor({ state: 'visible' });
    await panel.locator('#connections-graph').waitFor({ state: 'visible' });

    await backlinkButton.click();
    await page.waitForURL(`**/nota/${FORMAS_ID}`);
    expect(page.url()).toContain(FORMAS_ID);

    await page.close();
  } finally {
    await stopServeChildren(children);
    removeTempTree(parent);
  }
}, 120_000);
