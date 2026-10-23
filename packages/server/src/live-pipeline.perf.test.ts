import { writeAtomic } from '@gaveta/core';
import { NFR_SEED, generateVault, generatedNotePath, writeVault } from '@gaveta/fixtures';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { afterEach, expect, it } from 'vitest';
import WebSocket from 'ws';
import { expectedOrigin } from './auth.ts';
import { GAVETA_WS_PATH } from './constants.ts';
import { createGavetaServer } from './index.ts';
import { formatStageBreakdown, percentile, sumStages } from './live-pipeline-report.ts';
import { markWriteFinished, resetLivePipelineTracesForTests } from './live-pipeline-trace.ts';
import { wsMessageText } from './ws-message.ts';

const SAMPLES = 8;
const CI_P95_CEILING_MS = 1_200;

afterEach(() => {
  resetLivePipelineTracesForTests();
});

it('REQ-NFR-01: 1000-note vault pipeline stages (write → WebSocket)', async () => {
  const parent = mkdtempSync(join(tmpdir(), 'gaveta-live-pipeline-perf-'));
  const vaultRoot = join(parent, 'vault');
  const files = generateVault({ noteCount: 1000, seed: NFR_SEED });
  await writeVault(vaultRoot, files);
  const notePath = generatedNotePath(0);
  const token = 'pipeline-perf-token';
  const server = createGavetaServer({ vaultRoot, port: 0, token });
  try {
    const address = await server.listen();
    const origin = expectedOrigin(address.port);
    const socket = new WebSocket(`ws://127.0.0.1:${String(address.port)}${GAVETA_WS_PATH}`, {
      headers: { host: `127.0.0.1:${String(address.port)}`, origin },
    });
    await new Promise<void>((resolve, reject) => {
      socket.once('open', () => {
        resolve();
      });
      socket.on('error', reject);
    });
    socket.send(JSON.stringify({ type: 'auth', token }));
    await new Promise<void>((resolve) => {
      socket.once('message', () => {
        resolve();
      });
    });

    const endToEnd: number[] = [];
    const stageSamples: { stages: import('./live-pipeline-trace.ts').LivePipelineStages }[] = [];

    for (let index = 0; index < SAMPLES; index += 1) {
      const eventPromise = new Promise<import('./vault-events.ts').VaultNoteEvent>((resolve) => {
        const onMessage = (data: WebSocket.RawData): void => {
          const body = JSON.parse(wsMessageText(data)) as import('./vault-events.ts').VaultNoteEvent;
          if (body.type === 'note:changed' && body.path === notePath) {
            socket.off('message', onMessage);
            resolve(body);
          }
        };
        socket.on('message', onMessage);
      });
      const writeStart = performance.now();
      markWriteFinished(notePath, writeStart);
      const base =
        files.find((file) => file.path === notePath)?.contents ??
        '<!DOCTYPE html><html><head><meta charset="utf-8"><title>n</title></head><body></body></html>';
      await writeAtomic(`${vaultRoot}/${notePath}`, `${base}<!-- ${String(index)} -->`);
      const event = await eventPromise;
      const elapsed = performance.now() - writeStart;
      endToEnd.push(elapsed);
      if (event.pipeline !== undefined) {
        stageSamples.push({ stages: event.pipeline.stages });
      }
    }

    const p50 = percentile(endToEnd, 50);
    const p95 = percentile(endToEnd, 95);
    const totals = sumStages(stageSamples.map((sample) => sample.stages));
    const breakdown = formatStageBreakdown('server 1000-note vault', {
      ...totals,
      endToEnd: p50,
    });
    // eslint-disable-next-line no-console -- perf regression visibility in CI
    console.info(
      `REQ-NFR-01 live pipeline (n=${String(SAMPLES)}): p50=${p50.toFixed(1)}ms p95=${p95.toFixed(1)}ms (spec p95<500ms); ${breakdown}`,
    );
    expect(p95).toBeLessThan(CI_P95_CEILING_MS);
    socket.close();
    await server.close();
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
}, 300_000);
