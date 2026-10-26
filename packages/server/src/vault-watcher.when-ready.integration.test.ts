import { copyFile } from 'node:fs/promises';
import path from 'node:path';
import { expect, it } from 'vitest';
import WebSocket from 'ws';
import { expectedOrigin } from './auth.ts';
import { GAVETA_WS_PATH } from './constants.ts';
import { createGavetaServer } from './index.ts';
import { withVaultCopy } from './test-helpers.ts';
import { createWsVaultEventInbox } from './ws-vault-event-inbox.ts';

it('delivers the first vault note event after listen resolves', async () => {
  await withVaultCopy(async (vaultRoot) => {
    const token = 'watcher-ready-token';
    const server = createGavetaServer({ vaultRoot, port: 0, token });
    const address = await server.listen();
    const origin = expectedOrigin(address.port);
    const socket = new WebSocket(`ws://127.0.0.1:${String(address.port)}${GAVETA_WS_PATH}`, {
      headers: { host: `127.0.0.1:${String(address.port)}`, origin },
    });
    const inbox = createWsVaultEventInbox(socket);
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

    const target = path.join(vaultRoot, 'ready-probe.html');
    const seen = inbox.waitFor(
      (event) =>
        event.path === 'ready-probe.html' &&
        (event.type === 'note:added' || event.type === 'note:changed'),
    );
    await copyFile(path.join(vaultRoot, 'destino-enlace.html'), target);
    await seen;
    expect(true).toBe(true);
    socket.close();
    await server.close();
  });
}, 30_000);
