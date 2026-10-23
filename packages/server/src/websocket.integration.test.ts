import { randomBytes } from 'node:crypto';
import { writeAtomic } from '@gaveta/core';
import { expect, it } from 'vitest';
import WebSocket from 'ws';
import { createSessionToken, expectedOrigin } from './auth.ts';
import { GAVETA_WS_PATH } from './constants.ts';
import { createGavetaServer } from './index.ts';
import { withVaultCopy } from './test-helpers.ts';
import type { VaultNoteEvent } from './vault-events.ts';
import { wsMessageText } from './ws-message.ts';

function secWebSocketKey(): string {
  return randomBytes(16).toString('base64');
}

function waitForMessage(socket: WebSocket): Promise<string> {
  return new Promise((resolve, reject) => {
    socket.once('message', (data) => {
      resolve(wsMessageText(data));
    });
    socket.once('error', reject);
    socket.once('close', () => {
      reject(new Error('socket closed before message'));
    });
  });
}

function connectWs(port: number, origin: string, token?: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`ws://127.0.0.1:${String(port)}${GAVETA_WS_PATH}`, {
      headers: {
        host: `127.0.0.1:${String(port)}`,
        origin,
      },
    });
    socket.once('open', () => {
      if (token !== undefined) {
        socket.send(JSON.stringify({ type: 'auth', token }));
      }
      resolve(socket);
    });
    socket.once('error', reject);
  });
}

it('streams note:changed after an atomic write when authed', async () => {
  await withVaultCopy(async (vaultRoot) => {
    const token = createSessionToken();
    const server = createGavetaServer({ vaultRoot, port: 0, token });
    const address = await server.listen();
    const origin = expectedOrigin(address.port);
    const socket = await connectWs(address.port, origin, token);
    const authOk = await waitForMessage(socket);
    expect(JSON.parse(authOk)).toEqual({ type: 'auth:ok' });

    const notePath = 'destino-enlace.html';
    const changed = new Promise<VaultNoteEvent>((resolve) => {
      socket.on('message', (data) => {
        const parsed = JSON.parse(wsMessageText(data)) as VaultNoteEvent;
        if (parsed.type === 'note:changed') {
          resolve(parsed);
        }
      });
    });

    await writeAtomic(
      `${vaultRoot}/${notePath}`,
      '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Destino</title></head><body><p>editado</p></body></html>',
    );

    const event = await changed;
    expect(event.path).toBe(notePath);
    socket.close();
    await server.close();
  });
});

it('rejects cross-origin WebSocket upgrade', async () => {
  await withVaultCopy(async (vaultRoot) => {
    const token = createSessionToken();
    const server = createGavetaServer({ vaultRoot, port: 0, token });
    const address = await server.listen();
    const host = `127.0.0.1:${String(address.port)}`;
    const rejected = await server.app.inject({
      method: 'GET',
      url: GAVETA_WS_PATH,
      headers: {
        connection: 'upgrade',
        upgrade: 'websocket',
        'sec-websocket-key': secWebSocketKey(),
        'sec-websocket-version': '13',
        host,
        origin: 'http://evil.example:3847',
      },
    });
    expect(rejected.statusCode).toBe(403);
    await server.close();
  });
});

it('closes unauthenticated clients that never send auth', async () => {
  await withVaultCopy(async (vaultRoot) => {
    const token = createSessionToken();
    const server = createGavetaServer({
      vaultRoot,
      port: 0,
      token,
      webSocketAuthTimeoutMs: 250,
    });
    const address = await server.listen();
    const origin = expectedOrigin(address.port);
    const socket = await connectWs(address.port, origin);
    const closed = new Promise<number>((resolve) => {
      socket.once('close', (code) => {
        resolve(code);
      });
    });
    const code = await closed;
    expect(code).toBe(4401);
    await server.close();
  });
});
