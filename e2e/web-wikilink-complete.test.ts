import { spawn } from 'node:child_process';
import { cpSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, type Browser } from 'playwright';
import { afterAll, afterEach, beforeAll, expect, it } from 'vitest';
import {
  GAVETA_BIN,
  modChord,
  newWebPage,
  parseJson,
  removeTempTree,
  stopServeChildren,
  type JsonEnvelope,
} from './helpers.ts';

const REPO_ROOT = join(import.meta.dirname, '..');
const BACKLINKS = join(REPO_ROOT, 'fixtures/vaults/backlinks');

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
  });
}

it('REQ-APP-12: completes [[ wikilinks in visual and code editors', async () => {
  const parent = mkdtempSync(join(tmpdir(), 'gaveta-e2e-wikilink-complete-'));
  const vault = join(parent, 'vault');
  cpSync(BACKLINKS, vault, { recursive: true });
  try {
    const started = await startServe(vault);
    const { url } = started.json.data;
    const page = await newWebPage(browser);
    await page.goto(url, { waitUntil: 'networkidle' });

    const origenId = '01M5HGV8800000000000000001';
    await page.goto(new URL(`/nota/${origenId}`, url).toString(), { waitUntil: 'networkidle' });
    await page.getByTestId('note-edit-button').click();
    await page.getByTestId('visual-editor-surface').click();
    await page.keyboard.type(' [[Dest');
    const visualList = page.getByTestId('wikilink-completion-list');
    await visualList.getByRole('option', { name: /Destino enlace/ }).waitFor({ state: 'visible' });
    await visualList.getByRole('option', { name: /Destino enlace/ }).click();
    expect(await page.getByTestId('visual-editor-surface').textContent()).toContain(
      '[[Destino enlace]]',
    );

    await page.getByTestId('visual-editor-cancel').click();
    await page.getByTestId('enter-code-mode').click();
    await page.getByTestId('code-note-editor').click();
    await page.keyboard.press(modChord('End'));
    const completeResponse = page.waitForResponse(
      (response) => response.url().includes('/api/wikilink-complete') && response.status() === 200,
    );
    await page.keyboard.type('\n<p>[[Form');
    await completeResponse;
    const codeTooltip = page.locator('.code-editor .cm-tooltip-autocomplete');
    await codeTooltip.getByText('Formas de enlace').waitFor({ state: 'visible' });
    await page.keyboard.press('Enter');
    const codeHost = page.locator('.code-editor');
    expect(await codeHost.textContent()).toContain('[[Formas de enlace]]');

    await page.close();
  } finally {
    await stopServeChildren(children);
    removeTempTree(parent);
  }
}, 120_000);
