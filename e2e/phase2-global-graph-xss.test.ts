import { spawn } from 'node:child_process';
import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { vaultPath } from '@gaveta/fixtures';
import { chromium, type Browser } from 'playwright';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { GAVETA_BIN, parseJson, type JsonEnvelope } from './helpers.ts';

const REPO_ROOT = join(import.meta.dirname, '..');
const MALICIOUS = vaultPath('malicious');

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

describe('T2.10 global graph XSS labels', () => {
  it('REQ-SEC-01: graph node labels with HTML in titles render as text only', async () => {
    const parent = mkdtempSync(join(tmpdir(), 'gaveta-phase2-graph-xss-'));
    const vault = join(parent, 'vault');
    cpSync(MALICIOUS, vault, { recursive: true });
    try {
      const started = await startServe(vault);
      const { url } = started.json.data;
      const page = await browser.newPage();
      page.on('dialog', (dialog) => {
        void dialog.dismiss();
        throw new Error(`unexpected dialog: ${dialog.message()}`);
      });

      await page.goto(url, { waitUntil: 'networkidle' });
      await page.goto(new URL('/grafo', url).toString(), { waitUntil: 'networkidle' });
      await page.getByRole('heading', { name: 'Grafo global' }).waitFor({ state: 'visible' });
      await page.getByRole('img', { name: 'Grafo global del vault' }).waitFor({ state: 'visible' });

      const labelText = '<script>alert(1)</script>';
      await page
        .getByRole('button', { name: labelText })
        .waitFor({ state: 'visible', timeout: 30_000 });
      const svgHtml = await page.locator('.graph-view__svg').innerHTML();
      expect(svgHtml).not.toMatch(/<script[\s>]/iu);
      const labelNode = page.locator('.graph-view__label').filter({ hasText: labelText });
      expect(await labelNode.count()).toBeGreaterThan(0);

      await page.close();
    } finally {
      rmSync(parent, { recursive: true, force: true });
    }
  }, 120_000);
});
