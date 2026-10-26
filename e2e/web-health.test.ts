import { spawn } from 'node:child_process';
import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, type Browser } from 'playwright';
import { afterAll, afterEach, beforeAll, expect, it } from 'vitest';
import {
  ensureWebBuilt,
  GAVETA_BIN,
  parseJson,
  runGaveta,
  type JsonEnvelope,
  newWebPage,
} from './helpers.ts';

const REPO_ROOT = join(import.meta.dirname, '..');
const BACKLINKS = join(REPO_ROOT, 'fixtures/vaults/backlinks');

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
  });
}

it('REQ-APP-07: CLI link change surfaces a live doctor finding in the health panel', async () => {
  const parent = mkdtempSync(join(tmpdir(), 'gaveta-e2e-web-health-'));
  const vault = join(parent, 'vault');
  cpSync(BACKLINKS, vault, { recursive: true });
  try {
    const started = await startServe(vault);
    const { url } = started.json.data;

    const page = await newWebPage(browser);
    await page.goto(url, { waitUntil: 'networkidle' });
    const health = page.getByLabel('Panel de salud');
    await health.getByRole('heading', { name: 'Salud' }).waitFor({ timeout: 30_000 });

    const created = runGaveta(['new', 'Sondeo salud', '--type', 'doc', '--from', '-', '--json'], {
      cwd: vault,
      input:
        '<article><h1>Sondeo</h1><section id="cuerpo"><p>[[Enlace fantasma e2e]]</p></section></article>',
    });
    expect(created.status).toBe(0);

    await health.getByText('sondeo-salud.html').waitFor({ timeout: 30_000 });
    await health.getByText('Advertencias').waitFor({ state: 'visible' });
    await page.close();
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
}, 120_000);
