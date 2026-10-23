import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { chromium, type Browser } from 'playwright';
import { afterAll, afterEach, beforeAll, expect, it } from 'vitest';
import {
  GAVETA_BIN,
  initVault,
  parseJson,
  withTempVaultAsync,
  type JsonEnvelope,
} from './helpers.ts';

const REPO_ROOT = join(import.meta.dirname, '..');
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

it('REQ-APP-01 / REQ-SEC-06: gaveta serve loads the viewer shell and bootstraps the token', async () => {
  await withTempVaultAsync(async (vault) => {
    initVault(vault);
    const started = await startServe(vault);
    expect(started.json.ok).toBe(true);
    const { url, token } = started.json.data;

    const page = await browser.newPage();
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
    await page.getByText('Conexiones').waitFor({ state: 'visible' });

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
