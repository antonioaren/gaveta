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
const DEMO_VAULT = join(REPO_ROOT, 'examples/demo-vault');
const THEME_STORAGE_KEY = 'gaveta.themePreference';

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
  stopServeChildren(children);
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

function channelSum(rgb: string): number {
  const match = /rgb\((\d+),\s*(\d+),\s*(\d+)\)/.exec(rgb);
  if (match === null) {
    throw new Error(`unexpected rgb: ${rgb}`);
  }
  return Number(match[1]) + Number(match[2]) + Number(match[3]);
}

it('REQ-APP-02: dark shell preference syncs gaveta:theme to the render iframe', async () => {
  const vault = mkdtempSync(join(tmpdir(), 'gaveta-render-theme-'));
  cpSync(DEMO_VAULT, vault, { recursive: true });
  try {
    const {
      json: { data },
    } = await startServe(vault);
    const page = await newWebPage(browser);
    await page.goto(data.url, { waitUntil: 'networkidle' });

    await page.evaluate((key) => {
      localStorage.setItem(key, 'dark');
    }, THEME_STORAGE_KEY);
    await page.reload({ waitUntil: 'networkidle' });

    await page.getByTestId('explorer-note-developer-handbook.html').click();
    await page.getByTestId('note-render-frame').waitFor();

    const frame = page.frameLocator('[data-testid="note-render-frame"]');
    await frame.locator('body').waitFor({ timeout: 30_000 });

    const iframeTheme = await frame.locator('html').evaluate((html) => html.getAttribute('data-theme'));
    expect(iframeTheme).toBe('dark');

    const bodyBg = await frame.locator('body').evaluate((body) => getComputedStyle(body).backgroundColor);
    expect(channelSum(bodyBg)).toBeLessThan(80);
    expect(bodyBg).toBe('rgb(9, 9, 11)');

    await page.close();
  } finally {
    removeTempTree(vault);
  }
});
