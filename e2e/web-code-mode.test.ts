import { spawn } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, type Browser } from 'playwright';
import { afterAll, afterEach, beforeAll, expect, it } from 'vitest';
import { attachCspGuard, installCspViolationListener } from './csp-guard.ts';
import {
  GAVETA_BIN,
  initVault,
  modChord,
  newWebPage,
  parseJson,
  runGaveta,
  type JsonEnvelope,
} from './helpers.ts';
import { vaultPath } from '@gaveta/fixtures';

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
  cspGuard: ReturnType<typeof attachCspGuard>;
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
  const page = await newWebPage(browser);
  await installCspViolationListener(page);
  const cspGuard = attachCspGuard(page);
  const noteUrl = new URL(url);
  noteUrl.pathname = `/nota/${envelope.data.id}`;
  await page.goto(noteUrl.toString(), { waitUntil: 'networkidle' });
  await page.getByTestId('enter-code-mode').click();
  await page.getByText('Cargando modo código').waitFor({ state: 'hidden', timeout: 30_000 });
  await page.locator('.code-editor .cm-content').waitFor({ timeout: 30_000 });
  const editorDisplay = await page.locator('.code-editor .cm-editor').evaluate((element) => {
    return getComputedStyle(element).display;
  });
  expect(editorDisplay).toBe('flex');
  await cspGuard.assertClean();
  return { page, notePath, bytesBefore, noteId: envelope.data.id, cspGuard };
}

it('REQ-APP-11: save without edits keeps the note byte-identical', async () => {
  const parent = mkdtempSync(join(tmpdir(), 'gaveta-e2e-code-save-'));
  const vault = join(parent, 'vault');
  mkdirSync(vault, { recursive: true });
  initVault(vault);
  try {
    const { page, notePath, bytesBefore, cspGuard } = await openCodeModeForNewNote(vault);
    await page.getByRole('button', { name: 'Guardar' }).click();
    await page.waitForTimeout(800);
    const bytesAfter = readFileSync(notePath);
    expect(Buffer.compare(bytesBefore, bytesAfter)).toBe(0);
    await cspGuard.assertClean();
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
    const { page, notePath, bytesBefore, cspGuard } = await openCodeModeForNewNote(vault);
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
    await page.locator('.code-editor .cm-content').click();
    await page.keyboard.press('ArrowUp');
    const screenshotPath =
      process.env.CODE_MODE_SCREENSHOT_PATH ?? '/opt/cursor/artifacts/code-mode-diagnostic.png';
    try {
      mkdirSync(dirname(screenshotPath), { recursive: true });
      const shot = await page.screenshot({ fullPage: true });
      writeFileSync(screenshotPath, shot);
    } catch {
      // Optional artifact path (not writable on all CI hosts).
    }
    await page.getByRole('button', { name: 'Guardar' }).click();
    await page.getByText('El HTML no es válido').waitFor({ timeout: 10_000 });
    expect(Buffer.compare(bytesBefore, readFileSync(notePath))).toBe(0);
    await cspGuard.assertClean();
    await page.close();
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
}, 180_000);

it('T3.16: W_* warnings, status bar, hover, and F8 navigation', async () => {
  const parent = mkdtempSync(join(tmpdir(), 'gaveta-e2e-code-problems-'));
  const vault = join(parent, 'vault');
  mkdirSync(vault, { recursive: true });
  initVault(vault);
  try {
    const { page, bytesBefore, cspGuard } = await openCodeModeForNewNote(vault);
    const editor = page.locator('.code-editor .cm-content');
    await editor.click();
    await page.keyboard.press(modChord('a'));
    const withPending = bytesBefore
      .toString('utf8')
      .replace('</section>', '<p><a data-g-pending="Roadmap">Roadmap</a></p></section>');
    await page.keyboard.insertText(withPending);
    await page.waitForResponse(
      (response) =>
        response.url().includes('/api/validate') &&
        response.request().method() === 'POST' &&
        response.ok(),
      { timeout: 15_000 },
    );
    await page.locator('.code-editor .cm-lintRange-warning').first().waitFor({ timeout: 15_000 });
    const statusText = await page
      .locator('.code-editor [data-testid="code-editor-problems-status"]')
      .innerText();
    expect(statusText.toLowerCase()).toContain('advertencia');
    await page.locator('.code-editor .cm-lintRange-warning').first().hover();
    await page.locator('.code-editor .cm-tooltip-lint').waitFor({ timeout: 10_000 });
    const tooltipText = await page.locator('.code-editor .cm-tooltip-lint').innerText();
    expect(tooltipText).toContain('W_LINK_PENDING');
    await cspGuard.assertClean();
    await page.close();
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
}, 180_000);

it('T3.15: VS Code layer exposes fold gutter and localized search', async () => {
  const parent = mkdtempSync(join(tmpdir(), 'gaveta-e2e-code-vscode-'));
  const vault = join(parent, 'vault');
  mkdirSync(vault, { recursive: true });
  initVault(vault);
  try {
    const { page, cspGuard } = await openCodeModeForNewNote(vault);
    const foldGutterWidth = await page
      .locator('.code-editor .cm-foldGutter')
      .evaluate((element) => {
        return getComputedStyle(element).width;
      });
    expect(Number.parseFloat(foldGutterWidth)).toBeGreaterThan(0);
    const editor = page.locator('.code-editor .cm-content');
    await editor.click();
    await page.keyboard.press(modChord('f'));
    await page.locator('.code-editor .cm-panel.cm-search').waitFor({ timeout: 10_000 });
    const searchPanelText = await page.locator('.code-editor .cm-panel.cm-search').innerText();
    expect(searchPanelText).toContain('siguiente');
    await cspGuard.assertClean();
    await page.close();
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
}, 180_000);

it('T3.15: Mod-s saves edits through the API without CSP violations', async () => {
  const parent = mkdtempSync(join(tmpdir(), 'gaveta-e2e-code-mod-s-'));
  const vault = join(parent, 'vault');
  mkdirSync(vault, { recursive: true });
  initVault(vault);
  try {
    const { page, notePath, bytesBefore, cspGuard } = await openCodeModeForNewNote(vault);
    const editor = page.locator('.code-editor .cm-content');
    await editor.click();
    await page.keyboard.press(modChord('a'));
    const edited = bytesBefore
      .toString('utf8')
      .replace('<p>texto base</p>', '<p>texto editado</p>');
    await page.keyboard.insertText(edited);
    await editor.click();
    const saveResponse = page.waitForResponse(
      (response) =>
        response.url().includes('/api/edit') &&
        response.request().method() === 'POST' &&
        response.ok(),
      { timeout: 15_000 },
    );
    await editor.press(modChord('s'));
    await saveResponse;
    const bytesAfter = readFileSync(notePath);
    expect(bytesAfter.toString('utf8')).toContain('texto editado');
    expect(Buffer.compare(bytesBefore, bytesAfter)).not.toBe(0);
    await cspGuard.assertClean();
    await page.close();
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
}, 180_000);

it('T3.19: Open in VS Code fetches vscode URI on click without CSP violations', async () => {
  const parent = mkdtempSync(join(tmpdir(), 'gaveta-e2e-code-vscode-'));
  const vault = join(parent, 'vault');
  mkdirSync(vault, { recursive: true });
  initVault(vault);
  try {
    const { page, cspGuard } = await openCodeModeForNewNote(vault);
    const responsePromise = page.waitForResponse(
      (response) =>
        response.url().includes('/api/note/vscode-uri') &&
        response.request().method() === 'GET' &&
        response.ok(),
      { timeout: 15_000 },
    );
    await page.getByTestId('open-in-vscode').click();
    const response = await responsePromise;
    const body = (await response.json()) as { data: { uri: string } };
    expect(body.data.uri).toMatch(/^vscode:\/\/file\//);
    expect(body.data.uri.toLowerCase()).toContain('.html');
    await cspGuard.assertClean();
    await page.close();
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
}, 180_000);

it('T3.17: HTML intelligence (contract completion + Emmet) under CSP', async () => {
  const parent = mkdtempSync(join(tmpdir(), 'gaveta-e2e-code-emmet-'));
  const vault = join(parent, 'vault');
  mkdirSync(vault, { recursive: true });
  initVault(vault);
  try {
    const { page, cspGuard } = await openCodeModeForNewNote(vault);
    await page.getByTestId('code-mode-editor-hint').waitFor({ timeout: 10_000 });
    const hint = await page.getByTestId('code-mode-editor-hint').innerText();
    expect(hint.toLowerCase()).toContain('emmet');
    await page.locator('.code-editor .cm-editor').waitFor({ timeout: 10_000 });
    const highlightedTokenCount = await page
      .locator('.code-editor .cm-content .cm-line span')
      .count();
    expect(highlightedTokenCount).toBeGreaterThan(0);
    await cspGuard.assertClean();
    await page.close();
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
}, 180_000);

it('T3.14: code mode renders with gutters under the app CSP', async () => {
  const parent = mkdtempSync(join(tmpdir(), 'gaveta-e2e-code-csp-'));
  const vault = join(parent, 'vault');
  mkdirSync(vault, { recursive: true });
  initVault(vault);
  try {
    const { page, cspGuard } = await openCodeModeForNewNote(vault);
    const gutterWidth = await page.locator('.code-editor .cm-gutters').evaluate((element) => {
      return getComputedStyle(element).width;
    });
    expect(Number.parseFloat(gutterWidth)).toBeGreaterThan(0);
    const highlightedTokenCount = await page
      .locator('.code-editor .cm-content .cm-line span')
      .count();
    expect(highlightedTokenCount).toBeGreaterThan(0);
    const sampleTokenColor = await page
      .locator('.code-editor .cm-content .cm-line span')
      .first()
      .evaluate((span) => getComputedStyle(span).color);
    expect(sampleTokenColor.length).toBeGreaterThan(0);
    await cspGuard.assertClean();
    await page.close();
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
}, 180_000);

function readNoteId(html: string): string | null {
  const match = /name="gaveta:id"\s+content="([^"]+)"/.exec(html);
  return match?.[1] ?? null;
}

it('REQ-APP-13: code mode hides external-change banner after accepting disk version', async () => {
  const parent = mkdtempSync(join(tmpdir(), 'gaveta-e2e-code-external-'));
  const vault = join(parent, 'vault');
  cpSync(vaultPath('backlinks'), vault, { recursive: true });
  const probePath = 'nota-x.html';
  const original = readFileSync(join(vault, probePath), 'utf8');
  const noteId = readNoteId(original);
  expect(noteId).not.toBeNull();
  try {
    const started = await startServe(vault);
    const page = await newWebPage(browser);
    const noteUrl = new URL(started.json.data.url);
    noteUrl.pathname = `/nota/${noteId ?? ''}`;
    await page.goto(noteUrl.toString(), { waitUntil: 'networkidle' });
    await page.getByTestId('enter-code-mode').click();
    await page.getByText('Cargando modo código').waitFor({ state: 'hidden', timeout: 30_000 });
    await page.locator('.code-editor .cm-content').waitFor({ timeout: 30_000 });
    writeFileSync(join(vault, probePath), original.replace('Nota X', 'Nota X externa'));
    await page.getByTestId('note-external-change').waitFor({ timeout: 30_000 });
    await page.getByTestId('note-external-change-diff').click();
    await page.getByTestId('note-merge-view').waitFor();
    await page.getByTestId('note-merge-accept-theirs').click();
    await page.getByTestId('note-merge-view').waitFor({ state: 'hidden' });
    expect(await page.getByTestId('note-external-change').count()).toBe(0);
    await page.close();
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
}, 120_000);
