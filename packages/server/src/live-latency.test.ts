import { writeAtomic } from '@gaveta/core';
import { performance } from 'node:perf_hooks';
import { expect, it } from 'vitest';
import WebSocket from 'ws';
import { wsMessageText } from './ws-message.ts';
import { expectedOrigin } from './auth.ts';
import { GAVETA_WS_PATH } from './constants.ts';
import { createGavetaServer } from './index.ts';
import { markWriteFinished } from './live-pipeline-trace.ts';
import { withVaultCopy } from './test-helpers.ts';

function percentile(samples: readonly number[], p: number): number {
  const sorted = [...samples].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, index)] ?? 0;
}

it('REQ-NFR-01: watcher to WebSocket p95 stays under 500 ms (20 samples)', async () => {
  await withVaultCopy(async (vaultRoot) => {
    const token = 'latency-token';
    const server = createGavetaServer({ vaultRoot, port: 0, token });
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

    const samples: number[] = [];
    const notePath = 'destino-enlace.html';
    const html =
      '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Destino</title></head><body><p>x</p></body></html>';

    for (let index = 0; index < 20; index += 1) {
      const eventPromise = new Promise<void>((resolve) => {
        const onMessage = (data: WebSocket.RawData): void => {
          const body = JSON.parse(wsMessageText(data)) as { type?: string };
          if (body.type === 'note:changed') {
            socket.off('message', onMessage);
            resolve();
          }
        };
        socket.on('message', onMessage);
      });
      const start = performance.now();
      markWriteFinished(notePath, start);
      await writeAtomic(`${vaultRoot}/${notePath}`, `${html}<!-- ${String(index)} -->`);
      await eventPromise;
      samples.push(performance.now() - start);
    }

    const p95 = percentile(samples, 95);
    expect(p95).toBeLessThan(500);
    socket.close();
    await server.close();
  });
}, 60_000);
