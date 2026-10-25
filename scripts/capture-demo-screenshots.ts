import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { DEMO_VAULT_ABS } from './bootstrap-demo-vault.ts';

const REPO_ROOT = join(import.meta.dirname, '..');
const GAVETA_BIN = join(REPO_ROOT, 'packages/cli/bin/gaveta.js');
const ASSETS_DIR = join(REPO_ROOT, 'docs', 'assets');
const ARTIFACTS_DIR = '/opt/cursor/artifacts';
const VIEWPORT = { width: 1600, height: 900 };

const SCREENSHOTS = [
  'screenshot-graph.png',
  'screenshot-note.png',
  'screenshot-editor.png',
] as const;

function readNoteId(relativePath: string): string {
  const html = readFileSync(join(DEMO_VAULT_ABS, relativePath), 'utf8');
  const match = /name="gaveta:id"\s+content="([^"]+)"/.exec(html);
  if (match?.[1] === undefined) {
    throw new Error(`missing gaveta:id in ${relativePath}`);
  }
  return match[1];
}

async function startServe(
  vault: string,
): Promise<{ url: string; child: ReturnType<typeof spawn> }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [GAVETA_BIN, 'serve', '--json', '--port', '0'], {
      cwd: vault,
      env: { ...process.env, GAVETA_VAULT: vault },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let settled = false;
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
      if (!settled && stdout.includes('"schemaVersion"')) {
        settled = true;
        try {
          const json = JSON.parse(stdout) as { data: { url: string } };
          resolve({ url: json.data.url, child });
        } catch (error) {
          reject(error instanceof Error ? error : new Error(String(error)));
        }
      }
    });
    child.stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf8');
      if (text.length > 0 && !settled) {
        reject(new Error(text.trim()));
      }
    });
    child.on('error', (error) => {
      reject(error);
    });
  });
}

void readNoteId('developer-handbook.html');

const { execFileSync } = await import('node:child_process');
execFileSync('pnpm', ['build:web'], { cwd: REPO_ROOT, stdio: 'inherit' });

const { url, child } = await startServe(DEMO_VAULT_ABS);
mkdirSync(ASSETS_DIR, { recursive: true });
mkdirSync(ARTIFACTS_DIR, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: VIEWPORT });
const pageErrors: string[] = [];
page.on('pageerror', (error) => {
  pageErrors.push(error.message);
});

const origin = new URL(url).origin;

await page.goto(url, { waitUntil: 'networkidle' });
await page.getByRole('navigation', { name: 'Explorador de notas' }).waitFor();

await page.goto(`${origin}/grafo`, { waitUntil: 'networkidle' });
await page.getByRole('heading', { name: 'Grafo global' }).waitFor();
await page.screenshot({ path: join(ASSETS_DIR, 'screenshot-graph.png') });

await page.getByRole('button', { name: 'Notas' }).click();
await page.getByRole('navigation', { name: 'Explorador de notas' }).waitFor();
await page.getByTestId('explorer-note-developer-handbook.html').click();
await page.getByRole('heading', { name: 'Developer Handbook', level: 1 }).waitFor();
const renderFrame = page.frameLocator('[data-testid="note-render-frame"]');
await renderFrame.locator('h1').first().waitFor({ timeout: 30_000 });
await page.locator('[data-testid="note-meta-panel"]').evaluate((el) => {
  el.style.display = 'none';
});
await page.locator('[data-testid="note-render-frame"]').scrollIntoViewIfNeeded();
await page.screenshot({ path: join(ASSETS_DIR, 'screenshot-note.png') });

await page.getByTestId('explorer-note-local-first-knowledge.html').click();
await page.getByRole('heading', { name: 'Local-First Knowledge', level: 1 }).waitFor();
await page.getByTestId('note-edit-button').click();
await page.getByTestId('visual-editor-surface').waitFor({ timeout: 30_000 });
await page.screenshot({ path: join(ASSETS_DIR, 'screenshot-editor.png') });

for (const name of SCREENSHOTS) {
  const bytes = readFileSync(join(ASSETS_DIR, name));
  writeFileSync(join(ARTIFACTS_DIR, name), bytes);
}

await browser.close();
child.kill('SIGTERM');

if (pageErrors.length > 0) {
  throw new Error(`page errors during capture:\n${pageErrors.join('\n')}`);
}

console.info(`Screenshots written to ${ASSETS_DIR} and ${ARTIFACTS_DIR}`);
