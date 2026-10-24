import { ABSENT_NOTE_HASH } from '@gaveta/core';
import { expect, it } from 'vitest';
import WebSocket from 'ws';
import { createSessionToken, expectedOrigin } from './auth.ts';
import { GAVETA_WS_PATH } from './constants.ts';
import { GAVETA_TOKEN_HEADER, createGavetaServer } from './index.ts';
import { requestLocal } from './http-test.ts';
import { withVaultCopy } from './test-helpers.ts';
import type { VaultNoteEvent } from './vault-events.ts';
import { wsMessageText } from './ws-message.ts';

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

function connectWs(port: number, origin: string, token: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`ws://127.0.0.1:${String(port)}${GAVETA_WS_PATH}`, {
      headers: {
        host: `127.0.0.1:${String(port)}`,
        origin,
      },
    });
    socket.once('open', () => {
      socket.send(JSON.stringify({ type: 'auth', token }));
      resolve(socket);
    });
    socket.once('error', reject);
  });
}

it('emits note:changed after a write API edit', async () => {
  await withVaultCopy(async (vaultRoot) => {
    const token = createSessionToken();
    const server = createGavetaServer({ vaultRoot, port: 0, token });
    const address = await server.listen();
    const origin = expectedOrigin(address.port);
    const socket = await connectWs(address.port, origin, token);
    const authOk = await waitForMessage(socket);
    expect(JSON.parse(authOk)).toEqual({ type: 'auth:ok' });

    const read = await requestLocal(address.port, '/api/read?ref=Nota%20X&as=html', {
      [GAVETA_TOKEN_HEADER]: token,
      host: `127.0.0.1:${String(address.port)}`,
    });
    const hash = (JSON.parse(read.body) as { data: { hash: string } }).data.hash;

    const changed = new Promise<VaultNoteEvent>((resolve) => {
      socket.on('message', (data) => {
        const parsed = JSON.parse(wsMessageText(data)) as VaultNoteEvent;
        if (parsed.type === 'note:changed' && parsed.path === 'nota-x.html') {
          resolve(parsed);
        }
      });
    });

    const write = await requestLocal(
      address.port,
      '/api/edit',
      {
        [GAVETA_TOKEN_HEADER]: token,
        host: `127.0.0.1:${String(address.port)}`,
        'if-match': hash,
        'content-type': 'application/json',
      },
      'POST',
      JSON.stringify({
        ref: 'Nota X',
        mode: 'append',
        section: 'resumen',
        html: '<p>ws api</p>',
      }),
    );
    expect(write.status).toBe(200);

    const event = await changed;
    expect(event.path).toBe('nota-x.html');
    socket.close();
    await server.close();
  });
});

it('emits note:changed after a write API create', async () => {
  await withVaultCopy(async (vaultRoot) => {
    const token = createSessionToken();
    const server = createGavetaServer({ vaultRoot, port: 0, token });
    const address = await server.listen();
    const origin = expectedOrigin(address.port);
    const socket = await connectWs(address.port, origin, token);
    const authOk = await waitForMessage(socket);
    expect(JSON.parse(authOk)).toEqual({ type: 'auth:ok' });

    const created = new Promise<VaultNoteEvent>((resolve) => {
      socket.on('message', (data) => {
        const parsed = JSON.parse(wsMessageText(data)) as VaultNoteEvent;
        if (
          (parsed.type === 'note:added' || parsed.type === 'note:changed') &&
          parsed.path === 'ws-nueva.html'
        ) {
          resolve(parsed);
        }
      });
    });

    const write = await requestLocal(
      address.port,
      '/api/new',
      {
        [GAVETA_TOKEN_HEADER]: token,
        host: `127.0.0.1:${String(address.port)}`,
        'if-match': ABSENT_NOTE_HASH,
        'content-type': 'application/json',
      },
      'POST',
      JSON.stringify({ title: 'WS Nueva', type: 'doc' }),
    );
    expect(write.status).toBe(200);
    const createdPath = (JSON.parse(write.body) as { data: { path: string } }).data.path;
    expect(createdPath).toBe('ws-nueva.html');

    const event = await created;
    expect(event.type).toBe('note:changed');
    expect(event.path).toBe(createdPath);
    socket.close();
    await server.close();
  });
});
