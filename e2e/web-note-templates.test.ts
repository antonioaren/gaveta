import { spawn } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, type Browser } from 'playwright';
import { afterAll, afterEach, beforeAll, expect, it } from 'vitest';
import { GAVETA_BIN, parseJson, newWebPage, type JsonEnvelope } from './helpers.ts';

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
    child.on('exit', (code) => {
      if (!settled && code !== 0) {
        reject(new Error(`serve exited with ${String(code)}`));
      }
    });
  });
}

it('REQ-TYPE-07: new notes use the doc template from .gaveta/templates', async () => {
  const parent = mkdtempSync(join(tmpdir(), 'gaveta-e2e-web-templates-'));
  const vault = join(parent, 'vault');
  cpSync(BACKLINKS, vault, { recursive: true });
  const templatesDir = join(vault, '.gaveta', 'templates');
  mkdirSync(templatesDir, { recursive: true });
  writeFileSync(
    join(templatesDir, 'doc.html'),
    '<article><h1>{{title}}</h1><p data-g-template-marker="vault">Plantilla doc</p></article>\n',
    'utf8',
  );
  try {
    const started = await startServe(vault);
    expect(started.json.ok).toBe(true);
    const { url } = started.json.data;

    const page = await newWebPage(browser);
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Nueva nota' }).click();
    await page.getByRole('dialog', { name: 'Nueva nota' }).waitFor({ state: 'visible' });
    await page.getByLabel('Título').fill('Nota plantilla');
    await page.getByRole('button', { name: 'Crear nota' }).click();
    await page.waitForURL(/\/nota\//);

    const html = readFileSync(join(vault, 'nota-plantilla.html'), 'utf8');
    expect(html).toContain('data-g-template-marker="vault"');
    expect(html).toContain('Plantilla doc');

    await page.close();
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
}, 120_000);
