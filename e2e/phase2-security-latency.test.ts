import { randomBytes } from 'node:crypto';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { vaultPath } from '@gaveta/fixtures';
import { chromium, type Browser, type Page } from 'playwright';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { GAVETA_BIN, parseJson, runGaveta, type JsonEnvelope } from './helpers.ts';
import { requestLocal } from './serve-http.ts';
import { wsMessageText } from './ws-message.ts';

/** REQ-NFR-01 product target (p95 &lt; 500 ms on a warm 1000-note vault). */
const LATENCY_SPEC_P95_MS = 500;
/** CI-safe ceiling; failures here still warrant investigation. */
const LATENCY_CI_P95_MS = 4_000;
const LATENCY_SAMPLES = 5;

const REPO_ROOT = join(import.meta.dirname, '..');
const HANDLER_ID = '01M5HGV8800000000000000012';
const URL_JS_ID = '01M5HGV8800000000000000013';
const RENDER_ASSET_ID = '01M5HGV8800000000000000022';

const children: ReturnType<typeof spawn>[] = [];
let browser: Browser;

function percentile(samples: readonly number[], p: number): number {
  const sorted = [...samples].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, index)] ?? 0;
}

function isLocalUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost';
  } catch {
    return true;
  }
}

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
    child.on('exit', (code) => {
      if (!settled && code !== 0) {
        reject(new Error(`serve exited with ${String(code)}`));
      }
    });
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

function copyMaliciousVault(): string {
  const parent = mkdtempSync(join(tmpdir(), 'gaveta-phase2-malicious-'));
  const vault = join(parent, 'vault');
  cpSync(vaultPath('malicious'), vault, { recursive: true });
  return vault;
}

function copyProblemsVault(): string {
  const parent = mkdtempSync(join(tmpdir(), 'gaveta-phase2-problems-'));
  const vault = join(parent, 'vault');
  cpSync(vaultPath('problems'), vault, { recursive: true });
  return vault;
}

function copyBacklinksVault(): string {
  const parent = mkdtempSync(join(tmpdir(), 'gaveta-phase2-backlinks-'));
  const vault = join(parent, 'vault');
  cpSync(vaultPath('backlinks'), vault, { recursive: true });
  return vault;
}

async function openMaliciousShell(page: Page, url: string, noteButton: string): Promise<void> {
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: noteButton }).click();
  await page.locator('[data-testid="note-render-frame"]').waitFor({ state: 'visible' });
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

describe('T2.10 malicious fixture in the viewer shell', () => {
  it('REQ-SEC-01: sandboxed iframe, no remote loads, safe links, forged postMessage ignored', async () => {
    const vault = copyMaliciousVault();
    const started = await startServe(vault);
    const { url, token } = started.json.data;
    const page = await browser.newPage();
    const dialogs: string[] = [];
    const remoteUrls: string[] = [];
    page.on('dialog', (dialog) => {
      dialogs.push(dialog.message());
      void dialog.dismiss();
    });
    page.on('request', (request) => {
      const requestUrl = request.url();
      if (!isLocalUrl(requestUrl)) {
        remoteUrls.push(requestUrl);
      }
    });

    await openMaliciousShell(page, url, 'Handler');
    const frame = page.frameLocator('[data-testid="note-render-frame"]');
    await frame.locator('h1').waitFor();

    const sandbox = await page.locator('[data-testid="note-render-frame"]').getAttribute('sandbox');
    expect(sandbox).toBe('allow-scripts');
    expect(sandbox).not.toContain('allow-same-origin');

    const scriptRan = await page.evaluate(() => {
      return (globalThis as { __gavetaXss?: boolean }).__gavetaXss === true;
    });
    expect(scriptRan).toBe(false);
    expect(dialogs).toEqual([]);

    const hrefs = await frame
      .locator('a[href]')
      .evaluateAll((anchors) => anchors.map((anchor) => anchor.getAttribute('href')));
    for (const href of hrefs) {
      if (href === null || href.length === 0 || href === '#') {
        continue;
      }
      expect(href.toLowerCase()).not.toMatch(/^javascript:/u);
      expect(href.toLowerCase()).not.toMatch(/^data:/u);
    }

    const tabsBefore = await page.locator('[role="tab"]').count();
    await page.evaluate(() => {
      window.postMessage({ type: 'gaveta:navigate', ref: '01M5HGV8800000000000000999' }, '*');
    });
    await page.waitForTimeout(300);
    const tabsAfter = await page.locator('[role="tab"]').count();
    expect(tabsAfter).toBe(tabsBefore);

    await page.evaluate(async (headerToken) => {
      await fetch('/api/search?q=handler&limit=5', {
        headers: { 'x-gaveta-token': headerToken },
      });
    }, token);

    expect(remoteUrls.filter((entry) => entry.includes('evil.example'))).toEqual([]);
    await page.close();
    rmSync(join(vault, '..'), { recursive: true, force: true });
  }, 120_000);

  it('REQ-SEC-01: javascript URLs are neutralized inside the render iframe', async () => {
    const vault = copyMaliciousVault();
    const started = await startServe(vault);
    const { url } = started.json.data;
    const page = await browser.newPage();
    await openMaliciousShell(page, url, 'URL javascript');
    const frame = page.frameLocator('[data-testid="note-render-frame"]');
    const html = await frame.locator('body').innerHTML();
    expect(html.toLowerCase()).not.toContain('javascript:');
    expect(html.toLowerCase()).not.toMatch(/^data:/u);
    await page.close();
    rmSync(join(vault, '..'), { recursive: true, force: true });
  }, 120_000);
});

describe('T2.10 auth and path hardening (gaveta serve)', () => {
  it('rejects protected routes without a session token', async () => {
    const vault = copyMaliciousVault();
    const started = await startServe(vault);
    const { port, token } = started.json.data;
    const paths = [
      '/api/notes',
      '/api/doctor',
      '/api/search?q=test',
      `/api/render-ticket?id=${HANDLER_ID}`,
      `/render/${HANDLER_ID}`,
    ];
    for (const path of paths) {
      const response = await requestLocal(port, path);
      expect(response.status).toBe(401);
      expect(response.body).not.toContain(token);
    }
    const queryToken = await requestLocal(port, `/api/notes?token=${encodeURIComponent(token)}`);
    expect(queryToken.status).toBe(401);
    rmSync(join(vault, '..'), { recursive: true, force: true });
  });

  it('rejects render tickets that are missing, tampered, or for another note', async () => {
    const vault = copyMaliciousVault();
    const started = await startServe(vault);
    const { port, token } = started.json.data;
    const valid = await fetchRenderTicket(port, token, HANDLER_ID);
    const tampered = `${valid.slice(0, -1)}${valid.endsWith('a') ? 'b' : 'a'}`;
    const mismatched = await fetchRenderTicket(port, token, URL_JS_ID);

    expect((await requestLocal(port, `/render/${HANDLER_ID}`)).status).toBe(401);
    expect(
      (
        await requestLocal(port, `/render/${HANDLER_ID}`, {
          'x-gaveta-token': token,
        })
      ).status,
    ).toBe(401);
    expect(
      (await requestLocal(port, `/render/${HANDLER_ID}?token=${encodeURIComponent(token)}`)).status,
    ).toBe(401);
    expect(
      (await requestLocal(port, `/render/${HANDLER_ID}?t=${encodeURIComponent(tampered)}`)).status,
    ).toBe(401);
    expect(
      (await requestLocal(port, `/render/${HANDLER_ID}?t=${encodeURIComponent(mismatched)}`))
        .status,
    ).toBe(401);
    rmSync(join(vault, '..'), { recursive: true, force: true });
  });

  it('rejects traversal, encoding tricks, and rebinding-style Host/Origin', async () => {
    const vault = copyMaliciousVault();
    const started = await startServe(vault);
    const { port, token } = started.json.data;
    const headers = { 'x-gaveta-token': token };

    const traversal = await requestLocal(
      port,
      `/api/read?ref=${encodeURIComponent('../.gaveta/config.json')}`,
      headers,
    );
    expect(traversal.status).toBeGreaterThanOrEqual(400);

    const encodedTraversal = await requestLocal(
      port,
      `/api/read?ref=${encodeURIComponent('%2e%2e/.gaveta/config.json')}`,
      headers,
    );
    expect(encodedTraversal.status).toBeGreaterThanOrEqual(400);

    const collapsed = await requestLocal(port, '//api/notes', headers);
    expect(collapsed.status).toBe(404);

    const encodedApi = await requestLocal(port, '/%61pi/notes', headers);
    expect(encodedApi.status).toBe(200);

    const backslash = await requestLocal(port, '/api\\notes', headers);
    expect(backslash.status).toBeGreaterThanOrEqual(400);

    const nullByte = await requestLocal(port, '/api/notes%00extra', headers);
    expect(nullByte.status).toBeGreaterThanOrEqual(400);

    const forgedOrigin = await requestLocal(port, '/api/notes', {
      ...headers,
      origin: 'http://evil.example:80',
    });
    expect(forgedOrigin.status).toBe(403);

    const rebindingHost = await requestLocal(
      port,
      '/api/notes',
      headers,
      `127.0.0.1:${String(port)}.attacker.example`,
    );
    expect(rebindingHost.status).toBe(403);
    rmSync(join(vault, '..'), { recursive: true, force: true });
  });

  it('closes WebSocket clients without auth or with bad auth (4401) and rejects cross-origin upgrade', async () => {
    const vault = copyMaliciousVault();
    const started = await startServe(vault);
    const { port, token } = started.json.data;
    const origin = `http://127.0.0.1:${String(port)}`;
    const host = `127.0.0.1:${String(port)}`;

    const unauth = new WebSocket(`ws://127.0.0.1:${String(port)}/api/ws`, {
      headers: { host, origin },
    });
    const unauthCode = await new Promise<number>((resolve, reject) => {
      unauth.once('close', (code) => {
        resolve(code);
      });
      unauth.once('error', reject);
    });
    expect(unauthCode).toBe(4401);

    const badAuth = new WebSocket(`ws://127.0.0.1:${String(port)}/api/ws`, {
      headers: { host, origin },
    });
    await new Promise<void>((resolve, reject) => {
      badAuth.once('open', () => {
        resolve();
      });
      badAuth.once('error', reject);
    });
    badAuth.send(JSON.stringify({ type: 'auth', token: 'not-the-session-token' }));
    const badCode = await new Promise<number>((resolve) => {
      badAuth.once('close', (code) => {
        resolve(code);
      });
    });
    expect(badCode).toBe(4401);

    const crossOriginRejected = await new Promise<number>((resolve, reject) => {
      const request = http.request(
        {
          host: '127.0.0.1',
          port,
          path: '/api/ws',
          method: 'GET',
          headers: {
            Connection: 'Upgrade',
            Upgrade: 'websocket',
            'Sec-WebSocket-Key': randomBytes(16).toString('base64'),
            'Sec-WebSocket-Version': '13',
            host,
            origin: 'http://rebind.evil:80',
          },
        },
        (response) => {
          resolve(response.statusCode ?? 0);
        },
      );
      request.on('error', reject);
      request.end();
    });
    expect(crossOriginRejected).toBe(403);

    const good = new WebSocket(`ws://127.0.0.1:${String(port)}/api/ws`, {
      headers: { host, origin },
    });
    await new Promise<void>((resolve, reject) => {
      good.once('open', () => {
        resolve();
      });
      good.once('error', reject);
    });
    good.send(JSON.stringify({ type: 'auth', token }));
    const authBody = await new Promise<string>((resolve) => {
      good.once('message', (data) => {
        resolve(wsMessageText(data));
      });
    });
    expect(JSON.parse(authBody)).toEqual({ type: 'auth:ok' });
    good.close();
    rmSync(join(vault, '..'), { recursive: true, force: true });
  });
});

describe('T2.10 render file route', () => {
  it('allows only referenced attachments, blocks dotfiles and escapes, serves SVG with sandbox CSP', async () => {
    const vault = copyMaliciousVault();
    const started = await startServe(vault);
    const { port, token } = started.json.data;
    const ticket = await fetchRenderTicket(port, token, RENDER_ASSET_ID);
    const base = `/render/${RENDER_ASSET_ID}/file`;

    const allowed = await requestLocal(
      port,
      `${base}/attachments/pixel.svg?t=${encodeURIComponent(ticket)}`,
    );
    expect(allowed.status).toBe(200);
    expect(allowed.headers['content-security-policy']).toBe("default-src 'none'; sandbox");
    const headerDisposition = allowed.headers['content-disposition'];
    const dispositionText =
      headerDisposition === undefined
        ? ''
        : Array.isArray(headerDisposition)
          ? headerDisposition.join(',')
          : headerDisposition;
    expect(dispositionText).toContain('attachment');

    const secret = await requestLocal(
      port,
      `${base}/attachments/hidden-secret.svg?t=${encodeURIComponent(ticket)}`,
    );
    expect(secret.status).toBe(400);

    const gaveta = await requestLocal(
      port,
      `${base}/.gaveta/config.json?t=${encodeURIComponent(ticket)}`,
    );
    expect(gaveta.status).toBe(400);

    const dotfile = await requestLocal(
      port,
      `${base}/attachments/.hidden.svg?t=${encodeURIComponent(ticket)}`,
    );
    expect(dotfile.status).toBe(400);

    const parent = mkdtempSync(join(tmpdir(), 'gaveta-render-symlink-e2e-'));
    const outside = join(parent, 'outside.svg');
    writeFileSync(outside, '<svg/>', 'utf8');
    mkdirSync(join(vault, 'attachments'), { recursive: true });
    symlinkSync(outside, join(vault, 'attachments', 'leak.svg'));
    const leakTicket = await fetchRenderTicket(port, token, RENDER_ASSET_ID);
    const leak = await requestLocal(
      port,
      `${base}/attachments/leak.svg?t=${encodeURIComponent(leakTicket)}`,
    );
    expect(leak.status).toBe(400);

    rmSync(parent, { recursive: true, force: true });
    rmSync(join(vault, '..'), { recursive: true, force: true });
  });
});

describe('T2.10 XSS surfaces in the shell UI', () => {
  it('renders markup in titles, snippets, graph labels, doctor output, and todo view as text', async () => {
    const vault = copyMaliciousVault();
    const started = await startServe(vault);
    const { url } = started.json.data;
    const page = await browser.newPage();
    page.on('dialog', (dialog) => {
      void dialog.dismiss();
      throw new Error(`unexpected dialog: ${dialog.message()}`);
    });

    await page.goto(url, { waitUntil: 'networkidle' });
    await page.locator('.explorer__note-title').filter({ hasText: 'XSS target' }).waitFor();
    await page.getByRole('button', { name: 'XSS source' }).click();
    await page
      .locator('.connections__link-title')
      .filter({ hasText: 'XSS target' })
      .waitFor({ timeout: 15_000 });

    await page.keyboard.press('Control+k');
    const palette = page.getByRole('combobox', { name: 'Buscar notas o comandos' });
    await palette.fill('lista');
    await page.waitForTimeout(400);
    await page.locator('.palette__option-title').filter({ hasText: 'Lista XSS' }).waitFor({
      timeout: 10_000,
    });
    const snippetText = await page.locator('.palette__snippet').first().innerText();
    expect(snippetText).toContain('alert');
    expect(snippetText).not.toMatch(/<script[\s>]/iu);
    await page.keyboard.press('Escape');

    await page.getByRole('button', { name: 'Lista XSS' }).click();
    const docFrame = page.frameLocator('[data-testid="note-render-frame"]');
    await docFrame.getByText('<script>alert(1)</script>').waitFor();
    const docHtml = await docFrame.locator('body').innerHTML();
    expect(docHtml).not.toMatch(/<script[\s>]/iu);

    const graphLabel = page.locator('.connections-graph title').first();
    if (await graphLabel.count()) {
      const label = await graphLabel.textContent();
      expect(label ?? '').not.toMatch(/<script/iu);
    }

    await page.close();
    rmSync(join(vault, '..'), { recursive: true, force: true });
  }, 120_000);

  it('REQ-APP-07: health panel renders doctor finding messages as plain text', async () => {
    const vault = copyProblemsVault();
    const started = await startServe(vault);
    const { url } = started.json.data;
    const page = await browser.newPage();
    page.on('dialog', (dialog) => {
      void dialog.dismiss();
      throw new Error(`unexpected dialog: ${dialog.message()}`);
    });
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.getByLabel('Panel de salud').waitFor();
    await page.locator('.health__finding-message').first().waitFor({ timeout: 15_000 });
    expect(await page.locator('.health__finding-message script').count()).toBe(0);
    const html = await page.locator('.health__body').innerHTML();
    expect(html).not.toMatch(/<script[\s>]/iu);
    await page.close();
    rmSync(join(vault, '..'), { recursive: true, force: true });
  }, 120_000);
});

describe('T2.10 REQ-NFR-01 CLI-to-viewer latency', () => {
  it('records p50/p95 when the CLI edits a note and the open tab updates', async () => {
    const vault = copyBacklinksVault();
    const started = await startServe(vault);
    const { url } = started.json.data;
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Destino enlace' }).click();
    const frame = page.frameLocator('[data-testid="note-render-frame"]');
    await frame.locator('#resumen').waitFor();

    const samples: number[] = [];
    const stageRows: {
      chokidar?: number;
      debounceFlush?: number;
      indexUpdated?: number;
      wsSent?: number;
      wsReceived?: number;
      e2e?: number;
    }[] = [];
    for (let index = 0; index < LATENCY_SAMPLES; index += 1) {
      const marker = `latency-${String(index)}-${String(Date.now())}`;
      const startedAt = performance.now();
      const edit = runGaveta(
        [
          'edit',
          'destino-enlace.html',
          '--section',
          'resumen',
          '--replace',
          '--from',
          '-',
          '--json',
        ],
        { vault, input: `<p id="latency-probe">${marker}</p>` },
      );
      expect(edit.status).toBe(0);
      await page.evaluate(() => {
        (globalThis as { __gavetaWriteFinishedAt?: number }).__gavetaWriteFinishedAt =
          performance.now();
      });
      await frame
        .locator('#latency-probe')
        .filter({ hasText: marker })
        .waitFor({ timeout: 30_000 });
      const elapsed = performance.now() - startedAt;
      samples.push(elapsed);
      const pipeline = await page.evaluate(() => {
        const sample = (
          globalThis as {
            __gavetaLastPipeline?: {
              serverStages: {
                chokidar?: number;
                debounceFlush?: number;
                indexUpdated?: number;
                wsSent?: number;
              };
              wsReceivedMs: number;
            };
          }
        ).__gavetaLastPipeline;
        return sample ?? null;
      });
      if (pipeline !== null) {
        stageRows.push({
          chokidar: pipeline.serverStages.chokidar,
          debounceFlush: pipeline.serverStages.debounceFlush,
          indexUpdated: pipeline.serverStages.indexUpdated,
          wsSent: pipeline.serverStages.wsSent,
          wsReceived: pipeline.wsReceivedMs,
          e2e: elapsed,
        });
      }
      await page.waitForTimeout(200);
    }

    const p50 = percentile(samples, 50);
    const p95 = percentile(samples, 95);
    const avg = (key: keyof (typeof stageRows)[number]): number => {
      const values = stageRows
        .map((row) => row[key])
        .filter((value): value is number => value !== undefined);
      if (values.length === 0) {
        return 0;
      }
      return values.reduce((sum, value) => sum + value, 0) / values.length;
    };
    console.info(
      `REQ-NFR-01 latency (CLI edit → shell iframe): spec p95 < ${String(LATENCY_SPEC_P95_MS)} ms; ` +
        `observed p50=${p50.toFixed(1)} ms p95=${p95.toFixed(1)} ms (n=${String(LATENCY_SAMPLES)}); ` +
        `CI ceiling ${String(LATENCY_CI_P95_MS)} ms; ` +
        `stages(ms): chokidar=${avg('chokidar').toFixed(1)} debounce=${avg('debounceFlush').toFixed(1)} ` +
        `index=${avg('indexUpdated').toFixed(1)} wsSent=${avg('wsSent').toFixed(1)} ` +
        `wsClient=${avg('wsReceived').toFixed(1)} iframeE2E=${avg('e2e').toFixed(1)}`,
    );
    expect(p95).toBeLessThan(LATENCY_CI_P95_MS);
    await page.close();
    rmSync(join(vault, '..'), { recursive: true, force: true });
  }, 180_000);
});
