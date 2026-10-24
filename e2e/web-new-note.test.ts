import { spawn } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createNote, parseNote } from '@gaveta/core';
import { chromium, type Browser, type Page } from 'playwright';
import { afterAll, afterEach, beforeAll, expect, it } from 'vitest';
import {
  GAVETA_BIN,
  initVault,
  parseJson,
  runGaveta,
  withTempVaultAsync,
  type JsonEnvelope,
} from './helpers.ts';

const REPO_ROOT = join(import.meta.dirname, '..');
const BACKLINKS = join(REPO_ROOT, 'fixtures/vaults/backlinks');
const ARTIFACTS = '/opt/cursor/artifacts';
const STABLE_ID = '01JB7Z3K9QX4T5M2N8V6R0WYHE';
const STABLE_NOW = '2026-10-22T12:00:00.000Z';

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

function stripVolatileHtml(html: string): string {
  const meta = (name: string) => new RegExp(`<meta name="${name}" content="[^"]*"\\s*/?>`, 'g');
  return html
    .replace(meta('gaveta:id'), '<meta name="gaveta:id" content="ID" />')
    .replace(meta('gaveta:created'), '<meta name="gaveta:created" content="NOW" />')
    .replace(meta('gaveta:modified'), '<meta name="gaveta:modified" content="NOW" />')
    .replace(meta('gaveta:updated'), '<meta name="gaveta:updated" content="NOW" />');
}

async function fillNewNoteDialog(page: Page, title: string): Promise<void> {
  const dialog = page.getByRole('dialog', { name: 'Nueva nota' });
  await dialog.waitFor({ state: 'visible' });
  await dialog.getByLabel('Título').fill(title);
  await dialog.getByRole('button', { name: 'Crear nota' }).click();
}

it('REQ-APP-17: creates a note from the explorer and promotes pending links', async () => {
  await withTempVaultAsync(async (vault) => {
    initVault(vault);
    runGaveta(['new', 'Origen pendiente', '--type', 'doc', '--from', '-', '--json'], {
      cwd: vault,
      input:
        '<article><h1>Origen pendiente</h1><section id="cuerpo"><p>[[Nota desde app]]</p></section></article>',
    });
    runGaveta(['reindex', '--json'], { cwd: vault });

    const started = await startServe(vault);
    const { url } = started.json.data;
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'networkidle' });

    await page.getByRole('button', { name: 'Nueva nota' }).click();
    await page.getByRole('dialog', { name: 'Nueva nota' }).waitFor({ state: 'visible' });
    await page.screenshot({ path: join(ARTIFACTS, 'new-note-dialog.png'), fullPage: true });
    await fillNewNoteDialog(page, 'Nota desde app');
    await page.waitForURL(`**/nota/**`);

    const originHtml = readFileSync(join(vault, 'origen-pendiente.html'), 'utf8');
    expect(originHtml.includes('data-g-pending')).toBe(false);
    expect(originHtml.includes('data-g-to')).toBe(true);

    await page.screenshot({ path: join(ARTIFACTS, 'new-note-dialog-success.png'), fullPage: true });
    await page.close();
  });
});

it('REQ-APP-17: API create matches CLI output aside from id and timestamps', async () => {
  const parent = mkdtempSync(join(tmpdir(), 'gaveta-e2e-new-parity-'));
  const vaultApi = join(parent, 'api');
  const vaultCli = join(parent, 'cli');
  mkdirSync(vaultApi, { recursive: true });
  mkdirSync(vaultCli, { recursive: true });
  try {
    initVault(vaultApi);
    initVault(vaultCli);
    const title = 'Paridad API';
    const tags = ['alpha', 'beta'];
    const folder = 'carpeta';

    const viaCore = await createNote({
      vaultRoot: vaultApi,
      title,
      type: 'doc',
      folder,
      tags,
      id: STABLE_ID,
      now: STABLE_NOW,
    });
    expect(viaCore.ok).toBe(true);
    if (!viaCore.ok) {
      return;
    }

    const cli = runGaveta(
      ['new', title, '--type', 'doc', '--in', folder, '--tags', 'alpha,beta', '--json'],
      { cwd: vaultCli },
    );
    expect(cli.status).toBe(0);
    const cliPath = (parseJson(cli.stdout).data as { path: string }).path;
    expect(cliPath).toBe(viaCore.path);

    const apiHtml = readFileSync(join(vaultApi, viaCore.path), 'utf8');
    const cliHtml = readFileSync(join(vaultCli, cliPath), 'utf8');
    expect(stripVolatileHtml(apiHtml)).toBe(stripVolatileHtml(cliHtml));

    const parsedApi = parseNote(apiHtml);
    const parsedCli = parseNote(cliHtml);
    expect(parsedApi.ok).toBe(true);
    expect(parsedCli.ok).toBe(true);
    expect(parsedApi.note?.title).toBe(parsedCli.note?.title);
    expect(parsedApi.note?.metadata.tags).toEqual(parsedCli.note?.metadata.tags);
    expect(parsedApi.note?.type).toBe(parsedCli.note?.type);
    expect(parsedApi.note?.plainText).toBe(parsedCli.note?.plainText);
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

it('REQ-APP-17: ghost graph opens the dialog with the title prefilled', async () => {
  const parent = mkdtempSync(join(tmpdir(), 'gaveta-e2e-new-ghost-'));
  const vault = join(parent, 'vault');
  cpSync(BACKLINKS, vault, { recursive: true });
  try {
    const started = await startServe(vault);
    const { url } = started.json.data;
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.goto(new URL('/grafo', url).toString(), { waitUntil: 'networkidle' });
    await page.getByRole('heading', { name: 'Grafo global' }).waitFor({ state: 'visible' });
    await page.getByText(/\d+ nodos ·/).waitFor({ state: 'visible' });
    await page
      .locator('circle.graph-view__node--ghost[aria-label="Nota fantasma"]')
      .click({ timeout: 60_000 });
    await page.getByRole('button', { name: 'Crear nota' }).click();
    const dialog = page.getByRole('dialog', { name: 'Nueva nota' });
    await dialog.waitFor({ state: 'visible' });
    expect(await dialog.getByLabel('Título').inputValue()).toBe('Nota fantasma');
    await page.screenshot({ path: join(ARTIFACTS, 'new-note-dialog-ghost.png'), fullPage: true });
    await page.close();
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
}, 120_000);
