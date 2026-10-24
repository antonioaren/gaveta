import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { DEFAULT_DEV_VAULT_DIR, seedDevVault } from '../tests/lib/seed-dev-vault.ts';

const REPO_ROOT = join(import.meta.dirname, '..');
const GAVETA_BIN = join(REPO_ROOT, 'packages/cli/bin/gaveta.js');
const ARTIFACTS = '/opt/cursor/artifacts';
const VIEWPORT = { width: 1440, height: 900 };

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
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
      if (stdout.includes('"schemaVersion"')) {
        try {
          const json = JSON.parse(stdout) as { data: { url: string } };
          resolve({ url: json.data.url, child });
        } catch (error) {
          reject(error);
        }
      }
    });
    child.stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf8');
      if (text.length > 0) {
        reject(new Error(text));
      }
    });
    child.on('error', reject);
  });
}

const vault = join(REPO_ROOT, DEFAULT_DEV_VAULT_DIR);
await seedDevVault(vault);
const { execFileSync } = await import('node:child_process');
execFileSync('pnpm', ['build:web'], { cwd: REPO_ROOT, stdio: 'inherit' });

const { url, child } = await startServe(vault);
mkdirSync(ARTIFACTS, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: VIEWPORT });
await page.goto(url, { waitUntil: 'networkidle' });
await page.getByRole('navigation', { name: 'Explorador de notas' }).waitFor();
await page.screenshot({ path: join(ARTIFACTS, 'dev-seed-home-explorer.png'), fullPage: true });

const openNote = async (title: string, fileName: string): Promise<void> => {
  await page.getByRole('button', { name: title }).click();
  await page.frameLocator('[data-testid="note-render-frame"]').locator('h1').first().waitFor({
    timeout: 30_000,
  });
  await page.screenshot({ path: join(ARTIFACTS, fileName), fullPage: true });
};

await openNote('Bienvenida a Gaveta', 'dev-seed-bienvenida.png');
await openNote('Panel de ventas', 'dev-seed-panel-metricas.png');
await openNote('Roadmap 2026', 'dev-seed-presentacion-slides.png');
await openNote('Vitrina del tema — documento', 'dev-seed-manual-estilo.png');

await page.getByRole('button', { name: 'Grafo' }).click();
await page.getByRole('heading', { name: 'Grafo global' }).waitFor();
await page.screenshot({ path: join(ARTIFACTS, 'dev-seed-global-graph.png'), fullPage: true });

await page.getByRole('button', { name: 'Notas' }).click();
await page.keyboard.press('Control+k');
await page.getByPlaceholder('Buscar… (Ctrl+K)').waitFor();
await page.screenshot({ path: join(ARTIFACTS, 'dev-seed-search-palette.png'), fullPage: true });

await browser.close();
child.kill('SIGTERM');
console.info(`Screenshots saved under ${ARTIFACTS}`);
