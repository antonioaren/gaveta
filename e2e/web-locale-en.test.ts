import { spawn } from 'node:child_process';
import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, type Browser } from 'playwright';
import { afterAll, afterEach, beforeAll, expect, it } from 'vitest';
import { ensureWebBuilt, GAVETA_BIN, parseJson, type JsonEnvelope, newWebPage } from './helpers.ts';

const REPO_ROOT = join(import.meta.dirname, '..');
const EMPTY_VAULT = join(REPO_ROOT, 'fixtures/vaults/empty');

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

it('shows English chrome when the locale is set to en', async () => {
  const parent = mkdtempSync(join(tmpdir(), 'gaveta-e2e-locale-en-'));
  const vault = join(parent, 'vault');
  cpSync(EMPTY_VAULT, vault, { recursive: true });
  try {
    const started = await startServe(vault);
    const { url } = started.json.data;

    const page = await newWebPage(browser);
    await page.addInitScript(() => {
      localStorage.setItem('gaveta.locale', 'en');
    });
    await page.goto(url, { waitUntil: 'networkidle' });

    expect(await page.getByTestId('vault-import').innerText()).toBe('Import');
    expect(await page.getByTestId('language-select').inputValue()).toBe('en');
    await page.close();
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
}, 120_000);
