import { mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium, type Browser } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { initVault, normalizeNote } from '@gaveta/core';
import { EXIT_CODES } from '@gaveta/core';
import { REPO_ROOT, runGaveta } from './helpers.ts';

const NOTE_ID = '01JB7Z3K9QX4T5M2N8V6R0WYHC';
const CREATED = '2026-10-22T12:00:00.000Z';

function buildNoteHtml(): string {
  const body = [
    '<article>',
    '<h1>Diagramas E2E</h1>',
    '<section id="flujo">',
    '<h2>Flujo</h2>',
    '<pre class="mermaid">graph LR\n  A[Entrada] --> B[Proceso]\n  B --> C[Salida]</pre>',
    '</section>',
    '<section id="secuencia">',
    '<h2>Secuencia</h2>',
    '<pre class="mermaid">sequenceDiagram\n  participant A as Cliente\n  participant B as Nucleo\n  A->>B: leer\n  B-->>A: HTML</pre>',
    '</section>',
    '</article>',
  ].join('');
  const shell = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Diagramas E2E</title><meta name="gaveta:id" content="${NOTE_ID}"><meta name="gaveta:type" content="doc"><meta name="gaveta:created" content="${CREATED}"></head><body>${body}</body></html>`;
  const normalized = normalizeNote(shell, { notePath: 'diagramas-e2e.html' });
  if (!normalized.ok || normalized.html === null) {
    throw new Error('failed to normalize mermaid fixture note');
  }
  return normalized.html;
}

async function waitForMermaidSvgs(page: import('playwright').Page, count: number): Promise<void> {
  await page.waitForFunction(
    (expected) => document.querySelectorAll('pre.mermaid svg').length >= expected,
    count,
    { timeout: 30_000 },
  );
}

describe('mermaid rendering (file://)', () => {
  let browser: Browser;
  let vaultRoot: string;
  let notePath: string;

  beforeAll(async () => {
    browser = await chromium.launch();
    vaultRoot = mkdtempSync(join(tmpdir(), 'gaveta-mermaid-'));
    await initVault({ cwd: vaultRoot });
    notePath = join(vaultRoot, 'diagramas-e2e.html');
    writeFileSync(notePath, buildNoteHtml(), 'utf8');
  }, 120_000);

  afterAll(async () => {
    await browser.close();
    rmSync(vaultRoot, { recursive: true, force: true });
  });

  it('renders flowchart and sequence diagrams as SVG offline', async () => {
    const page = await browser.newPage();
    const errors: string[] = [];
    page.on('pageerror', (error) => {
      errors.push(error.message);
    });
    await page.goto(pathToFileURL(notePath).href, { waitUntil: 'load' });
    await waitForMermaidSvgs(page, 2);
    const svgCount = await page.locator('pre.mermaid svg').count();
    expect(svgCount).toBe(2);
    expect(errors).toEqual([]);
    await page.close();
  });

  it('keeps one svg per block after toggling data-theme', async () => {
    const page = await browser.newPage();
    await page.goto(pathToFileURL(notePath).href, { waitUntil: 'load' });
    await waitForMermaidSvgs(page, 2);
    await page.evaluate(() => {
      document.documentElement.dataset.theme = 'dark';
    });
    await waitForMermaidSvgs(page, 2);
    const perBlock = await page
      .locator('pre.mermaid')
      .evaluateAll((nodes) => nodes.map((node) => node.querySelectorAll('svg').length));
    expect(perBlock).toEqual([1, 1]);
    await page.close();
  });

  it('renders after init backfills mermaid assets on a legacy vault', async () => {
    const legacyRoot = mkdtempSync(join(tmpdir(), 'gaveta-mermaid-legacy-'));
    try {
      await initVault({ cwd: legacyRoot });
      unlinkSync(join(legacyRoot, '.gaveta/mermaid.min.js'));
      unlinkSync(join(legacyRoot, '.gaveta/mermaid-boot.js'));
      unlinkSync(join(legacyRoot, '.gaveta/MERMAID-LICENSE.txt'));

      const claudeSource = readFileSync(
        join(REPO_ROOT, 'fixtures/claude/mermaid-doc.html'),
        'utf8',
      );
      const claudePath = join(legacyRoot, 'arquitectura.html');
      writeFileSync(claudePath, claudeSource, 'utf8');

      const adopt = runGaveta(
        ['adopt', 'arquitectura.html', '--source', 'claude', '--json', '--vault', legacyRoot],
        { cwd: legacyRoot },
      );
      expect(adopt.status).toBe(EXIT_CODES.ok);

      const backfill = runGaveta(['init', '--json', '--vault', legacyRoot], { cwd: legacyRoot });
      expect(backfill.status).toBe(EXIT_CODES.ok);
      const initData = JSON.parse(backfill.stdout) as { data: { created: string[] } };
      expect(initData.data.created).toContain('.gaveta/mermaid.min.js');

      const page = await browser.newPage();
      await page.goto(pathToFileURL(claudePath).href, { waitUntil: 'load' });
      await waitForMermaidSvgs(page, 2);
      await page.close();
    } finally {
      rmSync(legacyRoot, { recursive: true, force: true });
    }
  });
});
