import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { WEB_LOCALE_STORAGE_KEY } from '@gaveta/i18n';
import { chromium } from 'playwright';
import { DEMO_VAULT_ABS } from './bootstrap-demo-vault.ts';
import { parseCaptureLang, playwrightLocale, type CaptureLang } from './capture-demo-locale.ts';
import {
  countOverlappingGraphLabels,
  defrayGraphLabels,
  ensureGraphFullyVisible,
  fitGlobalGraphView,
  scrollApplicationToTop,
  waitForGlobalGraphReady,
} from './capture-demo-graph.ts';

const REPO_ROOT = join(import.meta.dirname, '..');
const GAVETA_BIN = join(REPO_ROOT, 'packages/cli/bin/gaveta.js');
const ASSETS_DIR = join(REPO_ROOT, 'docs', 'assets');
const ARTIFACTS_DIR = '/opt/cursor/artifacts';
const VIEWPORT = { width: 1600, height: 900 };
/** ~70% of the prior ~0.82 fill target — more margin around the cluster. */
const GRAPH_FILL_RATIO = 0.58;

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
  lang: CaptureLang,
): Promise<{ url: string; child: ReturnType<typeof spawn> }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [GAVETA_BIN, 'serve', '--json', '--port', '0'], {
      cwd: vault,
      env: { ...process.env, GAVETA_VAULT: vault, GAVETA_LANG: lang },
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

async function captureScreenshots(lang: CaptureLang): Promise<void> {
  void readNoteId('developer-handbook.html');
  void readNoteId('visual-editor-showcase.html');
  const locale = playwrightLocale(lang);

  const { execFileSync } = await import('node:child_process');
  execFileSync('pnpm', ['build:web'], { cwd: REPO_ROOT, stdio: 'inherit' });

  const { url, child } = await startServe(DEMO_VAULT_ABS, lang);
  mkdirSync(ASSETS_DIR, { recursive: true });
  mkdirSync(ARTIFACTS_DIR, { recursive: true });

  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: VIEWPORT,
    locale,
  });
  await context.addInitScript(
    ({ storageKey, language }: { storageKey: string; language: string }) => {
      try {
        localStorage.setItem(storageKey, language.startsWith('es') ? 'es' : 'en');
      } catch {
        /* private mode */
      }
      Object.defineProperty(navigator, 'language', {
        configurable: true,
        get: () => language,
      });
      Object.defineProperty(navigator, 'languages', {
        configurable: true,
        get: () => [language],
      });
      const short = language.split('-')[0] ?? language;
      const applyHtmlLang = (): void => {
        try {
          document.documentElement.lang = short;
        } catch {
          /* subframe or empty document during navigation */
        }
      };
      applyHtmlLang();
      document.addEventListener('DOMContentLoaded', applyHtmlLang, { once: true });
    },
    { storageKey: WEB_LOCALE_STORAGE_KEY, language: locale },
  );

  const page = await context.newPage();
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => {
    pageErrors.push(error.message);
  });

  const origin = new URL(url).origin;

  await page.goto(url, { waitUntil: 'networkidle' });
  await page.getByTestId('language-select').waitFor();
  await page.getByTestId('explorer-note-developer-handbook.html').waitFor({ timeout: 30_000 });

  await page.goto(`${origin}/grafo`, { waitUntil: 'networkidle' });
  await waitForGlobalGraphReady(page);
  await fitGlobalGraphView(page, GRAPH_FILL_RATIO);
  await defrayGraphLabels(page);
  let overlapPairs = await countOverlappingGraphLabels(page);
  if (overlapPairs > 0) {
    await fitGlobalGraphView(page, GRAPH_FILL_RATIO * 0.94);
    await defrayGraphLabels(page);
    overlapPairs = await countOverlappingGraphLabels(page);
  }
  await ensureGraphFullyVisible(page);
  if (overlapPairs > 0) {
    await fitGlobalGraphView(page, GRAPH_FILL_RATIO * 0.9);
    await defrayGraphLabels(page);
    await ensureGraphFullyVisible(page);
  }
  await scrollApplicationToTop(page);
  await page.screenshot({ path: join(ASSETS_DIR, 'screenshot-graph.png') });

  await page.goto(url, { waitUntil: 'networkidle' });
  await page.getByTestId('explorer-note-developer-handbook.html').click();
  await page.getByTestId('note-render-frame').waitFor();
  const renderFrame = page.frameLocator('[data-testid="note-render-frame"]');
  await renderFrame.locator('h1').first().waitFor({ timeout: 30_000 });
  await page.locator('[data-testid="note-meta-panel"]').evaluate((el) => {
    el.style.display = 'none';
  });
  await scrollApplicationToTop(page);
  await renderFrame.locator('body').evaluate((body) => {
    const view = body.ownerDocument.defaultView;
    if (view === null) {
      return;
    }
    view.scrollTo(0, 0);
    body.querySelector('nav.toc')?.remove();
    body.querySelector('header.note-header')?.remove();
    const callouts = body.querySelector('section#callouts');
    const table = body.querySelector('section#table');
    if (callouts instanceof HTMLElement && table instanceof HTMLElement) {
      const blockBottom = table.offsetTop + table.offsetHeight;
      if (blockBottom > view.innerHeight) {
        view.scrollTo(0, Math.max(0, callouts.offsetTop - 8));
      }
    }
  });
  await scrollApplicationToTop(page);
  await page.screenshot({ path: join(ASSETS_DIR, 'screenshot-note.png') });

  await page.getByTestId('explorer-note-visual-editor-showcase.html').click();
  await page.getByTestId('note-render-frame').waitFor();
  await page.getByTestId('note-edit-button').click();
  await page.getByTestId('visual-editor-surface').waitFor({ timeout: 30_000 });
  const blockCount = await page.locator('[data-gaveta-html-block]').count();
  if (blockCount > 0) {
    throw new Error(
      `visual editor shows ${String(blockCount)} HTML block placeholder(s); use native blocks only`,
    );
  }
  await scrollApplicationToTop(page);
  await page.screenshot({ path: join(ASSETS_DIR, 'screenshot-editor.png') });

  for (const name of SCREENSHOTS) {
    const bytes = readFileSync(join(ASSETS_DIR, name));
    writeFileSync(join(ARTIFACTS_DIR, name), bytes);
  }

  await context.close();
  await browser.close();
  child.kill('SIGTERM');

  if (pageErrors.length > 0) {
    throw new Error(`page errors during capture:\n${pageErrors.join('\n')}`);
  }

  console.info(
    `Screenshots (${lang}, locale ${locale}) written to ${ASSETS_DIR} and ${ARTIFACTS_DIR}`,
  );
}

const isMain = process.argv[1]?.includes('capture-demo-screenshots') ?? false;
if (isMain) {
  const lang = parseCaptureLang(process.argv);
  await captureScreenshots(lang);
}
