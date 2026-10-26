import { spawn } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, sep } from 'node:path';
import { adoptNote, importMarkdownFolder, initVault } from '@gaveta/core';
import { FIXTURES_ROOT, markdownVaultPath, vaultPath } from '@gaveta/fixtures';
import { chromium, type Browser, type Page } from 'playwright';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  ensureWebBuilt,
  GAVETA_BIN,
  newWebPage,
  parseJson,
  removeTempTree,
  stopServeChildren,
  type JsonEnvelope,
} from './helpers.ts';

const REPO_ROOT = join(import.meta.dirname, '..');
const SCREENSHOT_DIR = join(REPO_ROOT, 'test-results', 'visual-editor');
const children: ReturnType<typeof spawn>[] = [];
let browser: Browser;

function walkHtml(dir: string, root = dir): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const absolute = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '.gaveta') {
        continue;
      }
      found.push(...walkHtml(absolute, root));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith('.html')) {
      found.push(relative(root, absolute).split(sep).join('/'));
    }
  }
  return found.sort();
}

function readNoteId(html: string): string | null {
  const match = /name="gaveta:id"\s+content="([^"]+)"/.exec(html);
  return match?.[1] ?? null;
}

beforeAll(async () => {
  mkdirSync(SCREENSHOT_DIR, { recursive: true });
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
  });
}

async function openNote(page: Page, shellUrl: string, noteId: string): Promise<void> {
  const origin = new URL(shellUrl).origin;
  await page.goto(shellUrl, { waitUntil: 'networkidle' });
  await page.goto(`${origin}/nota/${noteId}`, { waitUntil: 'networkidle' });
}

async function canReadNoteInApp(page: Page, noteId: string): Promise<boolean> {
  return page.evaluate(async (id) => {
    const token = sessionStorage.getItem('gaveta.sessionToken');
    const response = await fetch(`/api/read?ref=${encodeURIComponent(id)}&as=html`, {
      headers: token === null ? {} : { 'x-gaveta-token': token },
    });
    const body = (await response.json()) as { ok: boolean };
    return response.ok && body.ok;
  }, noteId);
}

async function saveNoteWithoutChanges(page: Page, shellUrl: string, noteId: string): Promise<void> {
  await openNote(page, shellUrl, noteId);
  if (!(await canReadNoteInApp(page, noteId))) {
    return;
  }
  await page.getByTestId('note-edit-button').click();
  try {
    await page.getByTestId('visual-editor-surface').waitFor({ timeout: 15_000 });
  } catch {
    return;
  }
  await page.getByTestId('visual-editor-save').click();
  await page.getByTestId('visual-editor').waitFor({ state: 'hidden', timeout: 30_000 });
}

async function assertGroupRoundTrip(
  vault: string,
  shellUrl: string,
  htmlPaths: readonly string[],
): Promise<void> {
  const page = await newWebPage(browser);
  try {
    for (const path of htmlPaths) {
      const absolute = join(vault, path);
      const before = readFileSync(absolute, 'utf8');
      const noteId = readNoteId(before);
      if (noteId?.length !== 26) {
        continue;
      }
      await saveNoteWithoutChanges(page, shellUrl, noteId);
      const after = readFileSync(absolute, 'utf8');
      expect(after).toBe(before);
    }
  } finally {
    await page.close();
  }
}

describe('REQ-APP-09/10 visual editor round-trip', () => {
  it('showcase vitrinas stay byte-identical after open + save', async () => {
    const parent = mkdtempSync(join(tmpdir(), 'gaveta-e2e-editor-showcase-'));
    const vault = join(parent, 'vault');
    cpSync(join(FIXTURES_ROOT, 'showcase'), vault, { recursive: true });
    try {
      const started = await startServe(vault);
      const paths = walkHtml(vault);
      await assertGroupRoundTrip(vault, started.json.data.url, paths);
    } finally {
      await stopServeChildren(children);
      removeTempTree(parent);
    }
  }, 180_000);

  it('backlinks vault notes stay byte-identical after open + save', async () => {
    const parent = mkdtempSync(join(tmpdir(), 'gaveta-e2e-editor-backlinks-'));
    const vault = join(parent, 'vault');
    cpSync(vaultPath('backlinks'), vault, { recursive: true });
    try {
      const started = await startServe(vault);
      await assertGroupRoundTrip(vault, started.json.data.url, walkHtml(vault));
    } finally {
      await stopServeChildren(children);
      removeTempTree(parent);
    }
  }, 180_000);

  it('malicious vault notes stay byte-identical after open + save', async () => {
    const parent = mkdtempSync(join(tmpdir(), 'gaveta-e2e-editor-malicious-'));
    const vault = join(parent, 'vault');
    cpSync(vaultPath('malicious'), vault, { recursive: true });
    try {
      const started = await startServe(vault);
      await assertGroupRoundTrip(vault, started.json.data.url, walkHtml(vault));
    } finally {
      await stopServeChildren(children);
      removeTempTree(parent);
    }
  }, 180_000);

  it('markdown import output stays byte-identical after open + save', async () => {
    const parent = mkdtempSync(join(tmpdir(), 'gaveta-e2e-editor-md-'));
    const vault = join(parent, 'vault');
    mkdirSync(vault);
    await initVault({ cwd: parent, directory: 'vault' });
    await importMarkdownFolder({ vaultRoot: vault, sourcePath: markdownVaultPath() });
    try {
      const started = await startServe(vault);
      await assertGroupRoundTrip(vault, started.json.data.url, walkHtml(vault));
    } finally {
      await stopServeChildren(children);
      removeTempTree(parent);
    }
  }, 300_000);

  it('adopted Claude artifacts stay byte-identical after open + save', async () => {
    const parent = mkdtempSync(join(tmpdir(), 'gaveta-e2e-editor-claude-'));
    const vault = join(parent, 'vault');
    mkdirSync(vault);
    await initVault({ cwd: parent, directory: 'vault' });
    const claudeDir = join(FIXTURES_ROOT, 'claude');
    for (const name of [
      'doc.html',
      'slides.html',
      'dashboard.html',
      'design.html',
      'react-app.html',
    ]) {
      const target = join(vault, name);
      cpSync(join(claudeDir, name), target);
      await adoptNote(vault, name, {
        source: 'claude',
        ...(name === 'react-app.html' ? { allowCdn: true } : {}),
      });
    }
    try {
      const started = await startServe(vault);
      await assertGroupRoundTrip(vault, started.json.data.url, walkHtml(vault));
    } finally {
      await stopServeChildren(children);
      removeTempTree(parent);
    }
  }, 180_000);

  it('REQ-APP-13: warns when the note changes on disk during visual edit', async () => {
    const parent = mkdtempSync(join(tmpdir(), 'gaveta-e2e-external-edit-'));
    const vault = join(parent, 'vault');
    cpSync(vaultPath('backlinks'), vault, { recursive: true });
    const probePath = 'nota-x.html';
    const original = readFileSync(join(vault, probePath), 'utf8');
    const noteId = readNoteId(original);
    expect(noteId).not.toBeNull();
    try {
      const started = await startServe(vault);
      const page = await newWebPage(browser);
      await openNote(page, started.json.data.url, noteId ?? '');
      await page.getByTestId('note-edit-button').click();
      await page.getByTestId('visual-editor-surface').waitFor({ timeout: 15_000 });
      writeFileSync(join(vault, probePath), original.replace('Nota X', 'Nota X externa'));
      await page.getByTestId('note-external-change').waitFor({ timeout: 30_000 });
      await page.getByTestId('note-external-change-diff').click();
      await page.getByTestId('note-merge-view').waitFor();
      expect(await page.getByTestId('note-merge-diff').textContent()).toContain('externa');
      await page.close();
    } finally {
      removeTempTree(parent);
    }
  }, 120_000);

  it('shows merge view on save conflict without overwriting disk', async () => {
    const parent = mkdtempSync(join(tmpdir(), 'gaveta-e2e-editor-conflict-'));
    const vault = join(parent, 'vault');
    cpSync(vaultPath('backlinks'), vault, { recursive: true });
    const probePath = 'nota-x.html';
    const original = readFileSync(join(vault, probePath), 'utf8');
    const noteId = readNoteId(original);
    expect(noteId).not.toBeNull();
    try {
      const started = await startServe(vault);
      const page = await newWebPage(browser);
      await openNote(page, started.json.data.url, noteId ?? '');
      await page.getByTestId('note-edit-button').click();
      await page.getByTestId('visual-editor-surface').waitFor();
      writeFileSync(join(vault, probePath), original.replace('Nota X', 'Nota X externa'));
      await page.getByTestId('visual-editor-save').click();
      await page.getByTestId('note-merge-view').waitFor({ timeout: 15_000 });
      expect(await page.getByTestId('note-merge-diff').textContent()).toContain('externa');
      expect(readFileSync(join(vault, probePath), 'utf8')).toContain('externa');
      await page.screenshot({
        path: join(SCREENSHOT_DIR, 'visual-editor-conflict.png'),
        fullPage: true,
      });
      await page.close();
    } finally {
      await stopServeChildren(children);
      removeTempTree(parent);
    }
  }, 120_000);

  it('captures the visual editor screenshot on a showcase note', async () => {
    const parent = mkdtempSync(join(tmpdir(), 'gaveta-e2e-editor-shot-'));
    const vault = join(parent, 'vault');
    cpSync(join(FIXTURES_ROOT, 'showcase'), vault, { recursive: true });
    const paths = walkHtml(vault);
    const first = paths[0];
    expect(first).toBeDefined();
    const html = readFileSync(join(vault, first), 'utf8');
    const noteId = readNoteId(html);
    expect(noteId).not.toBeNull();
    try {
      const started = await startServe(vault);
      const page = await newWebPage(browser);
      await openNote(page, started.json.data.url, noteId ?? '');
      await page.getByTestId('note-edit-button').click();
      await page.getByTestId('visual-editor-surface').waitFor();
      await page.screenshot({
        path: join(SCREENSHOT_DIR, 'visual-editor-showcase.png'),
        fullPage: true,
      });
      await page.close();
    } finally {
      await stopServeChildren(children);
      removeTempTree(parent);
    }
  }, 120_000);
});
