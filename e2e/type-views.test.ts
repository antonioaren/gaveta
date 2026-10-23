import { spawn } from 'node:child_process';
import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, type Browser } from 'playwright';
import { afterAll, afterEach, beforeAll, expect, it } from 'vitest';
import { GAVETA_BIN, parseJson } from './helpers.ts';
import { requestLocal } from './serve-http.ts';

const REPO_ROOT = join(import.meta.dirname, '..');
const SHOWCASE = join(REPO_ROOT, 'fixtures/showcase');

const DOC_ID = '01M5HGV8800000000000000101';
const SLIDES_ID = '01M5HGV8800000000000000102';
const TODO_ID = '01M5HGV8800000000000000103';

const children: ReturnType<typeof spawn>[] = [];
let browser: Browser;

async function startServe(vault: string): Promise<{ port: number; token: string }> {
  const child = spawn(process.execPath, [GAVETA_BIN, 'serve', '--json', '--port', '0'], {
    cwd: vault,
    env: { ...process.env, GAVETA_VAULT: vault },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  children.push(child);
  let stdout = '';
  return await new Promise((resolve, reject) => {
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
      if (stdout.includes('"schemaVersion"')) {
        const json = parseJson(stdout) as { data: { port: number; token: string } };
        resolve({ port: json.data.port, token: json.data.token });
      }
    });
    child.on('error', reject);
  });
}

async function fetchRenderTicket(port: number, token: string, noteId: string): Promise<string> {
  const response = await requestLocal(port, `/api/render-ticket?id=${encodeURIComponent(noteId)}`, {
    'x-gaveta-token': token,
  });
  expect(response.status).toBe(200);
  const payload = JSON.parse(response.body) as { data: { ticket: string } };
  return payload.data.ticket;
}

function showcaseVault(): string {
  const parent = mkdtempSync(join(import.meta.dirname, '.type-views-'));
  const vault = join(parent, 'vault');
  cpSync(SHOWCASE, vault, { recursive: true });
  return vault;
}

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

async function openRenderFrame(
  port: number,
  noteId: string,
  ticket: string,
): Promise<ReturnType<Browser['newPage']> extends Promise<infer P> ? P : never> {
  const shellOrigin = `http://127.0.0.1:${String(port)}`;
  const renderUrl = `${shellOrigin}/render/${noteId}?t=${encodeURIComponent(ticket)}`;
  const page = await browser.newPage();
  await page.goto(`${shellOrigin}/`, { waitUntil: 'domcontentloaded' });
  await page.evaluate((url) => {
    document.body.innerHTML = '';
    const iframe = document.createElement('iframe');
    iframe.id = 'gaveta-render';
    iframe.setAttribute('sandbox', 'allow-scripts');
    iframe.src = url;
    document.body.appendChild(iframe);
  }, renderUrl);
  return page;
}

it('doc view shows a lateral table of contents', async () => {
  const vault = showcaseVault();
  try {
    const started = await startServe(vault);
    const ticket = await fetchRenderTicket(started.port, started.token, DOC_ID);
    const page = await openRenderFrame(started.port, DOC_ID, ticket);
    const frame = page.frameLocator('#gaveta-render');
    await frame.locator('.gaveta-render__toc nav.toc a[href="#componentes"]').waitFor();
    const snapshot = await frame.locator('.gaveta-render--doc').ariaSnapshot();
    expect(snapshot).toContain('Índice');
    await page.close();
  } finally {
    rmSync(join(vault, '..'), { recursive: true, force: true });
  }
}, 60_000);

it('slides view supports presentation mode and keyboard navigation', async () => {
  const vault = showcaseVault();
  try {
    const started = await startServe(vault);
    const ticket = await fetchRenderTicket(started.port, started.token, SLIDES_ID);
    const page = await openRenderFrame(started.port, SLIDES_ID, ticket);
    const frame = page.frameLocator('#gaveta-render');
    await frame.locator('[data-gaveta-action="present"]').click();
    await frame.locator('html.gaveta-presenting').waitFor({ timeout: 5000 });
    await page.keyboard.press('ArrowRight');
    await frame.locator('section.slide[data-gaveta-slide-active="true"]#lista').waitFor();
    await page.keyboard.press('Escape');
    await frame.locator('html.gaveta-presenting').waitFor({ state: 'detached', timeout: 5000 });
    await page.close();
  } finally {
    rmSync(join(vault, '..'), { recursive: true, force: true });
  }
}, 60_000);

it('todo view filters tasks read-only', async () => {
  const vault = showcaseVault();
  try {
    const started = await startServe(vault);
    const ticket = await fetchRenderTicket(started.port, started.token, TODO_ID);
    const page = await openRenderFrame(started.port, TODO_ID, ticket);
    const frame = page.frameLocator('#gaveta-render');
    await frame.locator('button[data-filter="open"]').click();
    expect(await frame.locator('li[data-g-task]:not([hidden])').count()).toBe(1);
    await frame.locator('button[data-filter="done"]').click();
    expect(await frame.locator('li[data-g-task]:not([hidden])').count()).toBe(1);
    await page.close();
  } finally {
    rmSync(join(vault, '..'), { recursive: true, force: true });
  }
}, 60_000);

it('passes a basic accessibility smoke check on doc render', async () => {
  const vault = showcaseVault();
  try {
    const started = await startServe(vault);
    const ticket = await fetchRenderTicket(started.port, started.token, DOC_ID);
    const page = await openRenderFrame(started.port, DOC_ID, ticket);
    const frame = page.frameLocator('#gaveta-render');
    await frame.locator('.gaveta-render--doc').waitFor();
    const tree = await frame.locator('body').ariaSnapshot();
    expect(tree).toMatch(/heading/i);
    expect(tree).toMatch(/Índice|link/i);
    await page.close();
  } finally {
    rmSync(join(vault, '..'), { recursive: true, force: true });
  }
}, 60_000);
