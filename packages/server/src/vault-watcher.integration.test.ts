import { copyFile, mkdir, rename } from 'node:fs/promises';
import path from 'node:path';
import { expect, it } from 'vitest';
import WebSocket from 'ws';
import { wsMessageText } from './ws-message.ts';
import { expectedOrigin } from './auth.ts';
import { GAVETA_WS_PATH } from './constants.ts';
import { createGavetaServer } from './index.ts';
import { withVaultCopy } from './test-helpers.ts';

it('emits note:moved when a note is renamed across folders with the same ULID', async () => {
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

    const from = path.join(vaultRoot, 'folder-a', 'destino.html');
    const to = path.join(vaultRoot, 'folder-b', 'destino.html');
    await mkdir(path.join(vaultRoot, 'folder-a'), { recursive: true });
    await mkdir(path.join(vaultRoot, 'folder-b'), { recursive: true });

    const waitFor = (types: readonly string[], notePath?: string): Promise<void> =>
      new Promise((resolve) => {
        const onMessage = (data: WebSocket.RawData): void => {
          const body = JSON.parse(wsMessageText(data)) as { type?: string; path?: string };
          if (
            body.type !== undefined &&
            types.includes(body.type) &&
            (notePath === undefined || body.path === notePath)
          ) {
            socket.off('message', onMessage);
            resolve();
          }
        };
        socket.on('message', onMessage);
      });

    const added = waitFor(['note:added', 'note:changed'], 'folder-a/destino.html');
    await copyFile(path.join(vaultRoot, 'destino-enlace.html'), from);
    await added;

    const moved = new Promise<{ readonly type: string; readonly from: string }>((resolve) => {
      const onMessage = (data: WebSocket.RawData): void => {
        const body = JSON.parse(wsMessageText(data)) as { type?: string; from?: string };
        if (body.type === 'note:moved' && body.from === 'folder-a/destino.html') {
          socket.off('message', onMessage);
          resolve({ type: body.type, from: body.from });
        }
      };
      socket.on('message', onMessage);
    });

    const movedPromise = moved;
    await rename(from, to);
    const event = await movedPromise;
    expect(event.type).toBe('note:moved');
    socket.close();
    await server.close();
  });
}, 30_000);
