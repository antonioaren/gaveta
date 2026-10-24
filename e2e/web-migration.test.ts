import { spawn } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NOTE_X, vaultPath } from '@gaveta/fixtures';
import { chromium, type Browser, type Page } from 'playwright';
import { afterAll, afterEach, beforeAll, expect, it } from 'vitest';
import { GAVETA_BIN, initVault, parseJson, type JsonEnvelope } from './helpers.ts';

const REPO_ROOT = join(import.meta.dirname, '..');
const BACKLINKS = vaultPath('backlinks');

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

async function openShell(page: Page, baseUrl: string): Promise<void> {
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
}

it('REQ-MIG-12: import preview and export preview in the app', async () => {
  const parent = mkdtempSync(join(tmpdir(), 'gaveta-e2e-web-mig-'));
  const importVault = join(parent, 'import-vault');
  const mdFile = join(parent, 'entrada.md');
  try {
    mkdirSync(importVault, { recursive: true });
    const init = initVault(importVault);
    expect(init.status).toBe(0);
    writeFileSync(mdFile, '# Entrada web\n\nPárrafo de prueba.\n', 'utf8');
    const started = await startServe(importVault);
    const { url } = started.json.data;
    const page = await browser.newPage();
    await openShell(page, url);
    await page.getByTestId('vault-import').click();
    await page.getByTestId('import-file-input').setInputFiles(mdFile);
    await page.getByTestId('import-preview-dialog').waitFor({ state: 'visible' });
    await page.getByTestId('import-preview-summary').waitFor({ state: 'visible' });
    await page.screenshot({ path: '/opt/cursor/artifacts/import-preview.png', fullPage: true });
    await page.getByTestId('import-preview-confirm').click();
    await page.getByTestId('import-preview-dialog').waitFor({ state: 'hidden' });
    await page.getByText('Entrada web').waitFor({ state: 'visible' });
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

it('REQ-MIG-12: export markdown zip from a note', async () => {
  const parent = mkdtempSync(join(tmpdir(), 'gaveta-e2e-web-export-'));
  const webVault = join(parent, 'web');
  try {
    cpSync(BACKLINKS, webVault, { recursive: true });
    const started = await startServe(webVault);
    const { url } = started.json.data;
    const page = await browser.newPage();
    await openShell(page, url);
    await page.getByTestId(`explorer-note-${NOTE_X.path}`).click();
    await page.getByTestId('note-action-export').click();
    await page.getByTestId('export-preview-dialog').waitFor({ state: 'visible' });
    await page.getByTestId('export-preview-summary').waitFor({ state: 'visible' });
    await page.screenshot({ path: '/opt/cursor/artifacts/export-preview.png', fullPage: true });
    const downloadPromise = page.waitForEvent('download');
    await page.getByTestId('export-preview-confirm').click();
    const download = await downloadPromise;
    const zipPath = join(parent, 'export.zip');
    await download.saveAs(zipPath);
    const zipBytes = readFileSync(zipPath);
    expect(zipBytes.subarray(0, 4).toString('hex')).toBe('504b0304');
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});
