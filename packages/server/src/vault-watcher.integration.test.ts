import { copyFile, mkdir, rename } from 'node:fs/promises';
import path from 'node:path';
import { expect, it } from 'vitest';
import WebSocket from 'ws';
import { expectedOrigin } from './auth.ts';
import { GAVETA_WS_PATH } from './constants.ts';
import { createGavetaServer } from './index.ts';
import { withVaultCopy } from './test-helpers.ts';
import { createWsVaultEventInbox } from './ws-vault-event-inbox.ts';

it('emits note:moved when a note is renamed across folders with the same ULID', async () => {
  await withVaultCopy(async (vaultRoot) => {
    const token = 'watcher-rename-token';
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

    const from = path.join(vaultRoot, 'folder-a', 'destino.html');
    const to = path.join(vaultRoot, 'folder-b', 'destino.html');
    await mkdir(path.join(vaultRoot, 'folder-a'), { recursive: true });
    await mkdir(path.join(vaultRoot, 'folder-b'), { recursive: true });

    const added = inbox.waitFor(
      (event) =>
        (event.type === 'note:added' || event.type === 'note:changed') &&
        event.path === 'folder-a/destino.html',
      { timeoutMs: 90_000 },
    );
    await copyFile(path.join(vaultRoot, 'destino-enlace.html'), from);
    await added;

    const moved = inbox.waitFor(
      (event) => event.type === 'note:moved' && event.from === 'folder-a/destino.html',
      { timeoutMs: 90_000 },
    );
    await rename(from, to);
    const event = await moved;
    expect(event.type).toBe('note:moved');
    socket.close();
    await server.close();
  });
}, 120_000);
