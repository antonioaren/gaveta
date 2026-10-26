import { spawn } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { vaultPath } from '@gaveta/fixtures';
import { parseGavetaTaskToggleMessage } from '@gaveta/core';
import { chromium, type Browser } from 'playwright';
import { afterAll, afterEach, beforeAll, expect, it } from 'vitest';
import { ensureWebBuilt, GAVETA_BIN, parseJson, runGaveta, type JsonEnvelope } from './helpers.ts';
import { requestLocal } from './serve-http.ts';

const REPO_ROOT = join(import.meta.dirname, '..');
const SHOWCASE = join(REPO_ROOT, 'fixtures/showcase');
const SHOWCASE_TODO_ID = '01M5HGV8800000000000000103';
const ENLACE_20_PATH = 'enlaces/mas/enlace-20.html';
const children: ReturnType<typeof spawn>[] = [];
let browser: Browser;

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
  });
}

function copyVault(name: string): string {
  const parent = mkdtempSync(join(tmpdir(), `gaveta-interactive-tasks-${name}-`));
  const vault = join(parent, 'vault');
  cpSync(vaultPath('backlinks'), vault, { recursive: true });
  return vault;
}

function noteHtml(vault: string, relPath: string): string {
  return readFileSync(join(vault, relPath), 'utf8');
}

function taskIsChecked(html: string, taskId: string): boolean {
  const marker = `id="${taskId}"`;
  const markerAt = html.indexOf(marker);
  if (markerAt < 0) {
    return false;
  }
  const liStart = html.lastIndexOf('<li', markerAt);
  const liEnd = html.indexOf('</li>', markerAt);
  if (liStart < 0 || liEnd < 0) {
    return false;
  }
  return html.slice(liStart, liEnd).includes('checked');
}

function revisarIsChecked(html: string): boolean {
  return taskIsChecked(html, 'revisar');
}

async function openEnlace20(page: import('playwright').Page, baseUrl: string): Promise<void> {
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Enlace 20' }).click();
  await page
    .frameLocator('[data-testid="note-render-frame"]')
    .locator('li[data-g-task]#revisar')
    .waitFor({ timeout: 30_000 });
}

async function openNoteById(
  page: import('playwright').Page,
  baseUrl: string,
  noteId: string,
): Promise<void> {
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.goto(new URL(`/nota/${noteId}`, baseUrl).toString(), { waitUntil: 'networkidle' });
  await page
    .frameLocator('[data-testid="note-render-frame"]')
    .locator('li[data-g-task]')
    .first()
    .waitFor({ timeout: 30_000 });
}

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

it('REQ-APP-08: checking a task in the shell persists bytes matching gaveta todo check', async () => {
  const vault = copyVault('parity');
  const cliVault = join(vault, '..', 'cli');
  cpSync(vault, cliVault, { recursive: true });
  try {
    const started = await startServe(vault);
    const { url } = started.json.data;
    const before = noteHtml(vault, ENLACE_20_PATH);
    expect(revisarIsChecked(before)).toBe(false);

    const page = await browser.newPage();
    await openEnlace20(page, url);
    const frame = page.frameLocator('[data-testid="note-render-frame"]');
    await frame.locator('li[data-g-task]#revisar input[type="checkbox"]').click();

    await expect
      .poll(() => revisarIsChecked(noteHtml(vault, ENLACE_20_PATH)), { timeout: 15_000 })
      .toBe(true);

    const after = noteHtml(vault, ENLACE_20_PATH);
    const hashBefore = parseJson(
      runGaveta(['read', ENLACE_20_PATH, '--json'], { cwd: cliVault }).stdout,
    ).data as { hash: string };
    runGaveta(
      ['todo', 'check', ENLACE_20_PATH, 'revisar', '--if-match', hashBefore.hash, '--json'],
      { cwd: cliVault },
    );
    expect(after).toBe(noteHtml(cliVault, ENLACE_20_PATH));
    expect(runGaveta(['validate', ENLACE_20_PATH, '--json'], { cwd: vault }).status).toBe(0);
    await page.close();
  } finally {
    rmSync(join(vault, '..'), { recursive: true, force: true });
  }
}, 120_000);

it('REQ-APP-08: todo filters still work after toggling a task', async () => {
  const vault = join(mkdtempSync(join(tmpdir(), 'gaveta-todo-filter-')), 'vault');
  cpSync(SHOWCASE, vault, { recursive: true });
  try {
    const started = await startServe(vault);
    const { url } = started.json.data;
    const page = await browser.newPage();
    await openNoteById(page, url, SHOWCASE_TODO_ID);
    const frame = page.frameLocator('[data-testid="note-render-frame"]');
    await frame.locator('button[data-filter="open"]').click();
    const openTask = frame.locator('li[data-g-task]#revisar-tema input[type="checkbox"]');
    await openTask.click();
    await expect
      .poll(() => noteHtml(vault, 'vitrina-todo.html').includes('id="revisar-tema"'), {
        timeout: 15_000,
      })
      .toBe(true);
    expect(noteHtml(vault, 'vitrina-todo.html')).toMatch(/revisar-tema[\s\S]*checked/u);
    await page.close();
  } finally {
    rmSync(join(vault, '..'), { recursive: true, force: true });
  }
}, 120_000);

it('REQ-APP-08: doc notes with embedded tasks accept toggles', async () => {
  const vault = copyVault('doc-embed');
  const docPath = 'doc-con-tareas.html';
  const created = runGaveta(['new', 'Doc con tareas', '--type', 'doc', '--from', '-', '--json'], {
    cwd: vault,
    input:
      '<article><h1>Doc con tareas</h1><section id="tareas"><ul class="tasks"><li data-g-task id="anotar"><input type="checkbox" /> Anotar</li></ul></section></article>',
  });
  expect(created.status).toBe(0);
  try {
    const started = await startServe(vault);
    const { url } = started.json.data;
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Doc con tareas' }).click();
    const frame = page.frameLocator('[data-testid="note-render-frame"]');
    const task = frame.locator('li[data-g-task]#anotar input[type="checkbox"]');
    await task.waitFor();
    await task.click();
    await expect
      .poll(() => taskIsChecked(noteHtml(vault, docPath), 'anotar'), { timeout: 15_000 })
      .toBe(true);
    await page.close();
  } finally {
    rmSync(join(vault, '..'), { recursive: true, force: true });
  }
}, 120_000);

it('shows a Spanish conflict message and reverts the checkbox on 409', async () => {
  const vault = copyVault('conflict');
  try {
    const started = await startServe(vault);
    const { url } = started.json.data;
    const page = await browser.newPage();
    await page.route('**/api/todo/check', async (route) => {
      await route.fulfill({
        status: 409,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: false,
          schemaVersion: 1,
          error: {
            code: 'E_CONFLICT',
            message: 'La nota ha cambiado desde la última lectura.',
            hint: 'Hay que volver a leer la nota y reintentar con el hash actual en --if-match.',
          },
        }),
      });
    });
    await openEnlace20(page, url);
    const frame = page.frameLocator('[data-testid="note-render-frame"]');
    const box = frame.locator('li[data-g-task]#revisar input[type="checkbox"]');
    await box.click();
    await page.getByRole('alert').filter({ hasText: 'La nota ha cambiado' }).waitFor();
    expect(await box.isChecked()).toBe(false);
    expect(revisarIsChecked(noteHtml(vault, ENLACE_20_PATH))).toBe(false);
    await page.close();
  } finally {
    rmSync(join(vault, '..'), { recursive: true, force: true });
  }
}, 120_000);

it('serializes rapid double toggles without corrupting the note', async () => {
  const vault = copyVault('double');
  try {
    const started = await startServe(vault);
    const { url } = started.json.data;
    const page = await browser.newPage();
    await openEnlace20(page, url);
    const frame = page.frameLocator('[data-testid="note-render-frame"]');
    const box = frame.locator('li[data-g-task]#revisar input[type="checkbox"]');
    await box.dblclick();
    await page.waitForTimeout(800);
    const html = noteHtml(vault, ENLACE_20_PATH);
    const checkedCount = html.match(/\bchecked\b/gu)?.length ?? 0;
    expect(checkedCount).toBe(1);
    expect(runGaveta(['validate', ENLACE_20_PATH, '--json'], { cwd: vault }).status).toBe(0);
    await page.close();
  } finally {
    rmSync(join(vault, '..'), { recursive: true, force: true });
  }
}, 120_000);

it('REQ-SEC-01: forged shell postMessage cannot toggle tasks on other notes', async () => {
  const vault = copyVault('security');
  try {
    const started = await startServe(vault);
    const { url } = started.json.data;
    const page = await browser.newPage();
    await openEnlace20(page, url);
    const before = noteHtml(vault, ENLACE_20_PATH);
    await page.evaluate(() => {
      window.postMessage(
        { type: 'gaveta:task-toggle', taskId: 'revisar', checked: true, ref: 'nota-x.html' },
        '*',
      );
    });
    await page.waitForTimeout(400);
    expect(noteHtml(vault, ENLACE_20_PATH)).toBe(before);
    await page.close();
  } finally {
    rmSync(join(vault, '..'), { recursive: true, force: true });
  }
}, 60_000);

it('render bridge emits a valid gaveta:task-toggle payload', async () => {
  const vault = copyVault('bridge');
  try {
    const started = await startServe(vault);
    const { token } = started.json.data;
    const port = started.json.data.port;
    const notesResponse = await requestLocal(port, '/api/notes', {
      'x-gaveta-token': token,
      host: `127.0.0.1:${String(port)}`,
    });
    const notesBody = JSON.parse(notesResponse.body) as {
      data: { notes: { path: string; id: string | null }[] };
    };
    const enlace = notesBody.data.notes.find((note) => note.path === ENLACE_20_PATH);
    expect(enlace?.id).toBeTruthy();
    const noteId = enlace?.id ?? '';
    const ticketResponse = await requestLocal(
      port,
      `/api/render-ticket?id=${encodeURIComponent(noteId)}`,
      { 'x-gaveta-token': token, host: `127.0.0.1:${String(port)}` },
    );
    const ticketBody = JSON.parse(ticketResponse.body) as { data: { ticket: string } };
    const shellOrigin = `http://127.0.0.1:${String(port)}`;
    const renderUrl = `${shellOrigin}/render/${noteId}?t=${encodeURIComponent(ticketBody.data.ticket)}`;
    const page = await browser.newPage();
    await page.goto(shellOrigin, { waitUntil: 'domcontentloaded' });
    await page.evaluate((iframeSrc) => {
      document.body.innerHTML = '';
      const iframe = document.createElement('iframe');
      iframe.id = 'gaveta-render';
      iframe.setAttribute('sandbox', 'allow-scripts');
      iframe.src = iframeSrc;
      document.body.appendChild(iframe);
      Reflect.set(globalThis, '__gavetaTaskToggle', null);
      window.addEventListener('message', (event) => {
        const frame = document.getElementById('gaveta-render');
        if (frame instanceof HTMLIFrameElement && event.source === frame.contentWindow) {
          Reflect.set(globalThis, '__gavetaTaskToggle', event.data);
        }
      });
    }, renderUrl);
    const frame = page.frameLocator('#gaveta-render');
    await frame.locator('li[data-g-task]#revisar input[type="checkbox"]').click();
    await page.waitForFunction(() => Reflect.get(globalThis, '__gavetaTaskToggle') !== null);
    const payload = await page.evaluate(
      (): unknown => Reflect.get(globalThis, '__gavetaTaskToggle') as unknown,
    );
    expect(parseGavetaTaskToggleMessage(payload)).toEqual({
      type: 'gaveta:task-toggle',
      taskId: 'revisar',
      checked: true,
    });
    await page.close();
  } finally {
    rmSync(join(vault, '..'), { recursive: true, force: true });
  }
}, 120_000);
