import { spawn } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BACKLINK_COUNT, NOTE_X, linkerSpec, vaultPath } from '@gaveta/fixtures';
import { doctorVault, noteContentHash, readVaultText } from '@gaveta/core';
import { chromium, type Browser, type Page } from 'playwright';
import { afterAll, afterEach, beforeAll, expect, it } from 'vitest';
import {
  ensureWebBuilt,
  GAVETA_BIN,
  parseJson,
  runGaveta,
  type JsonEnvelope,
  newWebPage,
} from './helpers.ts';

const BACKLINKS = vaultPath('backlinks');

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

function cloneVault(parent: string, name: string): string {
  const target = join(parent, name);
  cpSync(BACKLINKS, target, { recursive: true });
  return target;
}

async function openNoteX(page: Page, baseUrl: string): Promise<void> {
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.getByTestId(`explorer-note-${NOTE_X.path}`).click();
  await page.getByTestId('note-action-rename').waitFor({ state: 'visible' });
}

async function expectBacklinksDialog(page: Page): Promise<void> {
  await page.getByTestId('note-ops-confirm').waitFor({ state: 'visible' });
  await page.getByText(/Enlaces entrantes \(\d+\)/u).waitFor({ state: 'visible' });
}

it('REQ-APP-14: rename rewrites backlinks with CLI parity', async () => {
  const parent = mkdtempSync(join(tmpdir(), 'gaveta-e2e-web-rename-'));
  const webVault = cloneVault(parent, 'web');
  const cliVault = cloneVault(parent, 'cli');
  try {
    const started = await startServe(webVault);
    const { url } = started.json.data;
    const page = await newWebPage(browser);
    await openNoteX(page, url);
    await page.getByTestId('note-action-rename').click();
    await expectBacklinksDialog(page);
    await page.getByTestId('note-rename-title').fill('Equis');
    await page.getByTestId('note-ops-confirm').click();
    await page.waitForTimeout(800);

    const hash = noteContentHash(await readVaultText(cliVault, NOTE_X.path));
    runGaveta(['mv', NOTE_X.title, 'equis.html', '--if-match', hash, '--json'], {
      vault: cliVault,
    });

    for (let index = 1; index <= BACKLINK_COUNT; index += 1) {
      const spec = linkerSpec(index);
      expect(readFileSync(join(webVault, spec.path), 'utf8')).toBe(
        readFileSync(join(cliVault, spec.path), 'utf8'),
      );
    }
    expect(readFileSync(join(webVault, 'equis.html'), 'utf8')).toBe(
      readFileSync(join(cliVault, 'equis.html'), 'utf8'),
    );
    const report = await doctorVault(webVault);
    expect(report.findings.filter((finding) => finding.code === 'E_LINK_BROKEN')).toHaveLength(0);
    await page.close();
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
}, 120_000);

it('REQ-APP-14: move to folder matches CLI bytes', async () => {
  const parent = mkdtempSync(join(tmpdir(), 'gaveta-e2e-web-move-'));
  const webVault = cloneVault(parent, 'web');
  const cliVault = cloneVault(parent, 'cli');
  try {
    const started = await startServe(webVault);
    const { url } = started.json.data;
    const page = await newWebPage(browser);
    await openNoteX(page, url);
    await page.getByTestId('note-action-move').click();
    await expectBacklinksDialog(page);
    await page.getByTestId('note-move-folder').fill('carpeta/movida');
    await page.getByTestId('note-ops-confirm').click();
    await page.waitForTimeout(800);

    const hash = noteContentHash(await readVaultText(cliVault, NOTE_X.path));
    runGaveta(['mv', NOTE_X.title, 'carpeta/movida/', '--if-match', hash, '--json'], {
      vault: cliVault,
    });

    expect(readFileSync(join(webVault, 'carpeta/movida/nota-x.html'), 'utf8')).toBe(
      readFileSync(join(cliVault, 'carpeta/movida/nota-x.html'), 'utf8'),
    );
    await page.close();
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
}, 120_000);

it('REQ-APP-14: rm is blocked by backlinks until force', async () => {
  const parent = mkdtempSync(join(tmpdir(), 'gaveta-e2e-web-rm-block-'));
  const webVault = cloneVault(parent, 'web');
  try {
    const started = await startServe(webVault);
    const { url } = started.json.data;
    const page = await newWebPage(browser);
    await openNoteX(page, url);
    await page.getByTestId('note-action-delete').click();
    await expectBacklinksDialog(page);
    await page.getByTestId('note-ops-confirm').click();
    await page.getByText(/enlaces entrantes/u).waitFor({ state: 'visible' });
    expect(await readVaultText(webVault, NOTE_X.path)).toContain(NOTE_X.title);
    await page.close();
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
}, 120_000);

it('REQ-APP-14: rm --force matches CLI bytes', async () => {
  const parent = mkdtempSync(join(tmpdir(), 'gaveta-e2e-web-rm-force-'));
  const webVault = cloneVault(parent, 'web');
  const cliVault = cloneVault(parent, 'cli');
  try {
    const started = await startServe(webVault);
    const { url } = started.json.data;
    const page = await newWebPage(browser);
    await openNoteX(page, url);
    await page.getByTestId('note-action-delete').click();
    await page.getByTestId('note-delete-force').click();
    await page.getByTestId('note-ops-confirm').click();
    await page.waitForTimeout(800);

    runGaveta(['rm', NOTE_X.path, '--force', '--json'], { vault: cliVault });

    for (let index = 1; index <= BACKLINK_COUNT; index += 1) {
      const spec = linkerSpec(index);
      expect(readFileSync(join(webVault, spec.path), 'utf8')).toBe(
        readFileSync(join(cliVault, spec.path), 'utf8'),
      );
    }
    await expect(readVaultText(webVault, NOTE_X.path)).rejects.toThrow();
    await page.getByText('Esta nota fue eliminada del vault.').waitFor({ state: 'visible' });
    await page.close();
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
}, 120_000);

it('REQ-APP-14: stale If-Match shows conflict and refreshes', async () => {
  const parent = mkdtempSync(join(tmpdir(), 'gaveta-e2e-web-conflict-'));
  const webVault = cloneVault(parent, 'web');
  try {
    const started = await startServe(webVault);
    const { url } = started.json.data;
    const page = await newWebPage(browser);
    await openNoteX(page, url);
    const readResponse = page.waitForResponse((response) => response.url().includes('/api/read'));
    const backlinksResponse = page.waitForResponse((response) =>
      response.url().includes('/api/backlinks'),
    );
    await page.getByTestId('note-action-rename').click();
    await expectBacklinksDialog(page);
    const readPayload = (await (await readResponse).json()) as { data: { hash: string } };
    await backlinksResponse;
    const staleHash = readPayload.data.hash;
    const edited = runGaveta(
      [
        'edit',
        NOTE_X.title,
        '--section',
        'resumen',
        '--append',
        '--if-match',
        staleHash,
        '--from',
        '-',
        '--json',
      ],
      { vault: webVault, input: '<p>cambio externo</p>' },
    );
    expect(edited.status).toBe(0);
    await page.getByTestId('note-rename-title').fill('Conflicto');
    const mvResponse = page.waitForResponse((response) => response.url().includes('/api/mv'));
    await page.getByTestId('note-ops-confirm').click();
    const response = await mvResponse;
    expect(response.status()).toBe(409);
    await page
      .getByText('La nota ha cambiado desde la última lectura')
      .waitFor({ state: 'visible' });
    await page.close();
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
}, 120_000);
