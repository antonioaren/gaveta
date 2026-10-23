import { writeAtomic } from '@gaveta/core';
import { rename } from 'node:fs/promises';
import path from 'node:path';
import { expect, it } from 'vitest';
import WebSocket from 'ws';
import { wsMessageText } from './ws-message.ts';
import { expectedOrigin } from './auth.ts';
import { GAVETA_WS_PATH } from './constants.ts';
import { createGavetaServer } from './index.ts';
import { withVaultCopy } from './test-helpers.ts';

it('handles atomic replace as note:changed and rename as note:moved', async () => {
  await withVaultCopy(async (vaultRoot) => {
    const token = 'watcher-rename-token';
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

    const events: string[] = [];
    socket.on('message', (data) => {
      const body = JSON.parse(wsMessageText(data)) as { type?: string };
      if (body.type?.startsWith('note:')) {
        events.push(body.type);
      }
    });

    const from = path.join(vaultRoot, 'renamed-from.html');
    const to = path.join(vaultRoot, 'renamed-to.html');
    await writeAtomic(
      from,
      '<!DOCTYPE html><html><head><meta charset="utf-8"><title>From</title></head><body><p>a</p></body></html>',
    );
    await new Promise<void>((resolve) => {
      const onMessage = (): void => {
        if (events.includes('note:added')) {
          socket.off('message', onMessage);
          resolve();
        }
      };
      socket.on('message', onMessage);
    });

    await rename(from, to);
    await new Promise<void>((resolve) => {
      const onMessage = (): void => {
        if (events.includes('note:moved')) {
          socket.off('message', onMessage);
          resolve();
        }
      };
      socket.on('message', onMessage);
    });

    expect(events).toContain('note:moved');
    socket.close();
    await server.close();
  });
});
