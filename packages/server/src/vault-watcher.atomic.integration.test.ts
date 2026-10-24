import path from 'node:path';
import { expect, it } from 'vitest';
import WebSocket from 'ws';
import { writeAtomic } from '@gaveta/core';
import { wsMessageText } from './ws-message.ts';
import { expectedOrigin } from './auth.ts';
import { GAVETA_WS_PATH } from './constants.ts';
import { createGavetaServer } from './index.ts';
import { withVaultCopy } from './test-helpers.ts';

it('emits note:changed after an atomic replace on an indexed note', async () => {
  await withVaultCopy(async (vaultRoot) => {
    const token = 'watcher-atomic-token';
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

    const notePath = path.join(vaultRoot, 'destino-enlace.html');
    const changed = new Promise<string>((resolve) => {
      const onMessage = (data: WebSocket.RawData): void => {
        const body = JSON.parse(wsMessageText(data)) as { type?: string; path?: string };
        if (body.type === 'note:changed' && body.path === 'destino-enlace.html') {
          socket.off('message', onMessage);
          resolve(body.type);
        }
        if (body.type === 'note:added' && body.path === 'destino-enlace.html') {
          socket.off('message', onMessage);
          resolve(body.type);
        }
      };
      socket.on('message', onMessage);
    });

    const html = await import('node:fs/promises').then((fs) => fs.readFile(notePath, 'utf8'));
    await writeAtomic(
      notePath,
      html.replace('Destino enlace', 'Destino enlace actualizado por atomic'),
    );
    const eventType = await changed;
    expect(eventType).toBe('note:changed');
    socket.close();
    await server.close();
  });
}, 30_000);
