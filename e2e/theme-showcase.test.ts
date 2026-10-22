import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium, type Browser, type Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const REPO_ROOT = join(import.meta.dirname, '..');
const SHOWCASE_HTML = join(REPO_ROOT, 'fixtures', 'showcase', 'vitrina-doc.html');
const SCREENSHOT_DIR = join(REPO_ROOT, 'test-results', 'theme-showcase');

async function openNote(page: Page, colorScheme: 'light' | 'dark'): Promise<void> {
  await page.emulateMedia({ colorScheme });
  const errors: string[] = [];
  page.on('pageerror', (error) => {
    errors.push(error.message);
  });
  page.on('console', (message) => {
    if (message.type() === 'error') {
      errors.push(message.text());
    }
  });
  await page.goto(pathToFileURL(SHOWCASE_HTML).href, { waitUntil: 'load' });
  expect(errors).toEqual([]);
}

describe('theme showcase (file://)', () => {
  let browser: Browser;

  beforeAll(async () => {
    mkdirSync(SCREENSHOT_DIR, { recursive: true });
    browser = await chromium.launch();
  }, 120_000);

  afterAll(async () => {
    await browser.close();
  });

  it('applies light tokens and styles key components', async () => {
    const page = await browser.newPage();
    await openNote(page, 'light');

    const bodyBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(bodyBg).toBe('rgb(250, 248, 245)');

    const calloutBorder = await page
      .locator('aside.callout[data-kind="info"]')
      .evaluate((node) => getComputedStyle(node).borderInlineStartColor);
    expect(calloutBorder).toBe('rgb(29, 78, 216)');

    const pendingColor = await page
      .locator('a[data-g-pending]')
      .evaluate((node) => getComputedStyle(node).color);
    expect(pendingColor).toBe('rgb(124, 45, 18)');

    await page.screenshot({ path: join(SCREENSHOT_DIR, 'vitrina-light.png'), fullPage: true });
    await page.close();
  });

  it('applies dark tokens via prefers-color-scheme', async () => {
    const page = await browser.newPage();
    await openNote(page, 'dark');

    const bodyBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(bodyBg).toBe('rgb(20, 18, 16)');

    const linkColor = await page
      .locator('a[data-g-to]')
      .evaluate((node) => getComputedStyle(node).color);
    expect(linkColor).toBe('rgb(147, 197, 253)');

    await page.screenshot({ path: join(SCREENSHOT_DIR, 'vitrina-dark.png'), fullPage: true });
    await page.close();
  });

  it('navigates to a linked note under file:// (REQ-VAULT-05)', async () => {
    const page = await browser.newPage();
    await openNote(page, 'light');

    const linkColor = await page
      .locator('a[data-g-to]')
      .first()
      .evaluate((node) => getComputedStyle(node).color);
    expect(linkColor).not.toBe('');

    await page.locator('a[data-g-to][href="vitrina-slides.html"]').click();
    await page.waitForURL(/vitrina-slides\.html$/);
    expect(await page.locator('h1').textContent()).toContain('Tema en presentación');
    await page.close();
  });

  it('honors html data-theme override over system preference', async () => {
    const page = await browser.newPage();
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto(pathToFileURL(SHOWCASE_HTML).href, { waitUntil: 'load' });
    await page.evaluate(() => {
      document.documentElement.dataset.theme = 'dark';
    });
    const bodyBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(bodyBg).toBe('rgb(20, 18, 16)');
    await page.close();
  });
});
