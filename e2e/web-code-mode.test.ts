import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, type Browser } from 'playwright';
import { afterAll, afterEach, beforeAll, expect, it } from 'vitest';
import { GAVETA_BIN, initVault, parseJson, runGaveta, type JsonEnvelope } from './helpers.ts';

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
  });
}

async function openCodeModeForNewNote(vault: string): Promise<{
  page: Awaited<ReturnType<Browser['newPage']>>;
  notePath: string;
  bytesBefore: Buffer;
  noteId: string;
}> {
  const created = runGaveta(['new', 'Modo código', '--type', 'doc', '--from', '-', '--json'], {
    cwd: vault,
    input:
      '<article><h1>Modo código</h1><section id="cuerpo"><p>texto base</p></section></article>',
  });
  expect(created.status).toBe(0);
  const envelope = parseJson<{ path: string; id: string }>(created.stdout);
  const notePath = join(vault, envelope.data.path);
  const bytesBefore = readFileSync(notePath);

  const started = await startServe(vault);
  const { url } = started.json.data;
  const page = await browser.newPage();
  const noteUrl = new URL(url);
  noteUrl.pathname = `/nota/${envelope.data.id}`;
  await page.goto(noteUrl.toString(), { waitUntil: 'networkidle' });
  await page.getByTestId('enter-code-mode').click();
  await page.getByText('Cargando modo código').waitFor({ state: 'hidden', timeout: 30_000 });
  await page.locator('.code-editor .cm-content').waitFor({ timeout: 30_000 });
  return { page, notePath, bytesBefore, noteId: envelope.data.id };
}

it('REQ-APP-11: save without edits keeps the note byte-identical', async () => {
  const parent = mkdtempSync(join(tmpdir(), 'gaveta-e2e-code-save-'));
  const vault = join(parent, 'vault');
  mkdirSync(vault, { recursive: true });
  initVault(vault);
  try {
    const { page, notePath, bytesBefore } = await openCodeModeForNewNote(vault);
    await page.getByRole('button', { name: 'Guardar' }).click();
    await page.waitForTimeout(800);
    const bytesAfter = readFileSync(notePath);
    expect(Buffer.compare(bytesBefore, bytesAfter)).toBe(0);
    await page.close();
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
}, 180_000);

it('REQ-APP-11: unsafe HTML shows inline diagnostics and blocks save', async () => {
  const parent = mkdtempSync(join(tmpdir(), 'gaveta-e2e-code-lint-'));
  const vault = join(parent, 'vault');
  mkdirSync(vault, { recursive: true });
  initVault(vault);
  try {
    const { page, notePath, bytesBefore } = await openCodeModeForNewNote(vault);
    const editor = page.locator('.code-editor .cm-content');
    const unsafeHtml = bytesBefore
      .toString('utf8')
      .replace('</article>', '<script>alert(1)</script></article>');
    await editor.click();
    await page.keyboard.press('Control+A');
    await page.keyboard.insertText(unsafeHtml);
    const validateResponse = await page.waitForResponse(
      (response) =>
        response.url().includes('/api/validate') &&
        response.request().method() === 'POST' &&
        response.ok(),
      { timeout: 15_000 },
    );
    const validateBody = (await validateResponse.json()) as {
      data: { ok: boolean; diagnostics: { code: string }[] };
    };
    expect(validateBody.data.ok).toBe(false);
    expect(
      validateBody.data.diagnostics.some((diagnostic) => diagnostic.code.startsWith('E_UNSAFE')),
    ).toBe(true);
    await page.locator('.cm-lintRange-error').first().waitFor({ timeout: 15_000 });
    mkdirSync('/opt/cursor/artifacts', { recursive: true });
    await page.locator('.code-editor .cm-content').click();
    await page.keyboard.press('ArrowUp');
    await page.screenshot({
      path: '/opt/cursor/artifacts/code-mode-diagnostic.png',
      fullPage: true,
    });
    await page.getByRole('button', { name: 'Guardar' }).click();
    await page.getByText('El HTML no es válido').waitFor({ timeout: 10_000 });
    expect(Buffer.compare(bytesBefore, readFileSync(notePath))).toBe(0);
    await page.close();
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
}, 180_000);
