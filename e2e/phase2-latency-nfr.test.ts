import { spawn } from 'node:child_process';
import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { vaultPath } from '@gaveta/fixtures';
import { chromium, type Browser } from 'playwright';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { GAVETA_BIN, parseJson, runGaveta, type JsonEnvelope } from './helpers.ts';

/** REQ-NFR-01 product target (p95 &lt; 500 ms on a warm 1000-note vault). */
const LATENCY_SPEC_P95_MS = 500;
/** CI-safe ceiling; failures here still warrant investigation. */
const LATENCY_CI_P95_MS = 4_000;
const LATENCY_SAMPLES = 5;

const REPO_ROOT = join(import.meta.dirname, '..');

const children: ReturnType<typeof spawn>[] = [];
let browser: Browser;

interface E2ePipelineSample {
  readonly serverStages: {
    readonly chokidar?: number;
    readonly debounceFlush?: number;
    readonly indexUpdated?: number;
    readonly wsSent?: number;
  };
  readonly wsReceivedMs: number;
}

function readE2ePipelineSample(value: unknown): E2ePipelineSample | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const record = value as Record<string, unknown>;
  const serverStages = record.serverStages;
  if (typeof serverStages !== 'object' || serverStages === null) {
    return null;
  }
  const stages = serverStages as Record<string, unknown>;
  const readStage = (key: string): number | undefined => {
    const stage = stages[key];
    return typeof stage === 'number' ? stage : undefined;
  };
  const wsReceivedMs = record.wsReceivedMs;
  if (typeof wsReceivedMs !== 'number') {
    return null;
  }
  return {
    serverStages: {
      chokidar: readStage('chokidar'),
      debounceFlush: readStage('debounceFlush'),
      indexUpdated: readStage('indexUpdated'),
      wsSent: readStage('wsSent'),
    },
    wsReceivedMs,
  };
}

function percentile(samples: readonly number[], p: number): number {
  const sorted = [...samples].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, index)] ?? 0;
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

function copyBacklinksVault(): string {
  const parent = mkdtempSync(join(tmpdir(), 'gaveta-phase2-latency-'));
  const vault = join(parent, 'vault');
  cpSync(vaultPath('backlinks'), vault, { recursive: true });
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
      const writeFinishedAt = Date.now();
      await page.evaluate((stamp: number) => {
        Reflect.set(globalThis, '__gavetaWriteFinishedAt', stamp);
      }, writeFinishedAt);
      await frame
        .locator('#latency-probe')
        .filter({ hasText: marker })
        .waitFor({ timeout: 60_000 });
      const elapsed = performance.now() - startedAt;
      samples.push(elapsed);
      const pipelineJson = await page.evaluate((): string | null => {
        const sample: unknown = Reflect.get(globalThis, '__gavetaLastPipeline');
        return sample === undefined ? null : JSON.stringify(sample);
      });
      const pipeline =
        pipelineJson === null ? null : readE2ePipelineSample(JSON.parse(pipelineJson) as unknown);
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
      await page.waitForTimeout(350);
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
