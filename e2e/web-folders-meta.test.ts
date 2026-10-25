import { spawn } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NOTE_X, vaultPath } from '@gaveta/fixtures';
import { chromium, type Browser, type Page } from 'playwright';
import { afterAll, afterEach, beforeAll, expect, it } from 'vitest';
import {
  GAVETA_BIN,
  newWebPage,
  parseJson,
  removeTempTree,
  resolveScreenshotDir,
  stopServeChildren,
  type JsonEnvelope,
} from './helpers.ts';

const REPO_ROOT = join(import.meta.dirname, '..');
const BACKLINKS = vaultPath('backlinks');

const children: ReturnType<typeof spawn>[] = [];
let browser: Browser;
let screenshotDir: string;

beforeAll(async () => {
  const { execFileSync } = await import('node:child_process');
  execFileSync('pnpm', ['build:web'], { cwd: REPO_ROOT, stdio: 'inherit' });
  browser = await chromium.launch();
  screenshotDir = resolveScreenshotDir('gaveta-e2e-folders-meta');
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
    child.on('error', reject);
    child.on('exit', (code) => {
      if (!settled && code !== 0) {
        reject(new Error(`serve exited with ${String(code)}`));
      }
    });
  });
}

async function openShell(page: Page, baseUrl: string): Promise<void> {
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
}

it('REQ-APP-18: creates a folder and edits tags from the note pane', async () => {
  const parent = mkdtempSync(join(tmpdir(), 'gaveta-e2e-folders-'));
  const vault = join(parent, 'vault');
  cpSync(BACKLINKS, vault, { recursive: true });
  try {
    const started = await startServe(vault);
    const page = await newWebPage(browser);
    await openShell(page, started.json.data.url);

    await page.getByTestId('explorer-new-folder').click();
    await page.getByTestId('folder-ops-name').fill('pruebas-app');
    await page.getByTestId('folder-ops-confirm').click();
    await page.getByTestId('folder-ops-dialog').waitFor({ state: 'hidden' });

    await page.getByTestId(`explorer-note-${NOTE_X.path}`).click();
    await page.getByTestId('note-meta-panel').waitFor({ state: 'visible' });
    await page.getByTestId('note-meta-tags').fill('e2e, carpetas');
    await page.getByTestId('note-meta-aliases').fill('Equis demo');
    const saveDone = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        response.url().includes('/api/meta') &&
        response.ok(),
    );
    await page.getByTestId('note-meta-save').click();
    await saveDone;
    await page.getByTestId('note-meta-saved').waitFor({ state: 'visible' });

    const html = readFileSync(join(vault, NOTE_X.path), 'utf8');
    expect(html).toContain('name="gaveta:tags" content="e2e, carpetas"');
    expect(html).toContain('name="gaveta:aliases" content="Equis demo"');

    await page.screenshot({ path: join(screenshotDir, 't3-12-folders-meta.png'), fullPage: true });
  } finally {
    await stopServeChildren(children);
    removeTempTree(parent);
  }
});
