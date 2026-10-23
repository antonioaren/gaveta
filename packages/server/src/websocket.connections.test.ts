import { expect, it } from 'vitest';
import WebSocket from 'ws';
import { expectedOrigin } from './auth.ts';
import { GAVETA_WS_PATH, WS_MAX_CONNECTIONS, WS_MAX_PENDING_CONNECTIONS } from './constants.ts';
import { createGavetaServer } from './index.ts';
import { withVaultCopy } from './test-helpers.ts';

function openSocket(port: number, origin: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`ws://127.0.0.1:${String(port)}${GAVETA_WS_PATH}`, {
      headers: { host: `127.0.0.1:${String(port)}`, origin },
    });
    socket.once('open', () => {
      resolve(socket);
    });
    socket.once('error', reject);
  });
}

function authSocket(socket: WebSocket, token: string): Promise<void> {
  return new Promise((resolve, reject) => {
    socket.send(JSON.stringify({ type: 'auth', token }));
    socket.once('message', () => {
      resolve();
    });
    socket.once('error', reject);
  });
}

it('rejects a pending socket above the unauthenticated cap with 1013', async () => {
  await withVaultCopy(async (vaultRoot) => {
    const token = 'cap-pending-overflow';
    const server = createGavetaServer({
      vaultRoot,
      port: 0,
      token,
      webSocketAuthTimeoutMs: 5_000,
    });
    const address = await server.listen();
    const origin = expectedOrigin(address.port);
    const pending: WebSocket[] = [];
    for (let index = 0; index < WS_MAX_PENDING_CONNECTIONS; index += 1) {
      pending.push(await openSocket(address.port, origin));
    }
    const overflow = await openSocket(address.port, origin);
    const rejected = new Promise<number>((resolve) => {
      overflow.once('close', (code) => {
        resolve(code);
      });
    });
    expect(await rejected).toBe(1013);
    for (const socket of pending) {
      socket.close();
    }
    await server.close();
  });
});

it('does not count pending unauthenticated sockets against the live cap', async () => {
  await withVaultCopy(async (vaultRoot) => {
    const token = 'cap-pending-token';
    const server = createGavetaServer({
      vaultRoot,
      port: 0,
      token,
      webSocketAuthTimeoutMs: 5_000,
    });
    const address = await server.listen();
    const origin = expectedOrigin(address.port);
    const authed: WebSocket[] = [];
    for (let index = 0; index < WS_MAX_CONNECTIONS; index += 1) {
      const socket = await openSocket(address.port, origin);
      await authSocket(socket, token);
      authed.push(socket);
    }
    const pending: WebSocket[] = [];
    for (let index = 0; index < WS_MAX_PENDING_CONNECTIONS; index += 1) {
      pending.push(await openSocket(address.port, origin));
    }
    for (const socket of pending) {
      socket.close();
    }
    for (const socket of authed) {
      socket.close();
    }
    await server.close();
  });
});

it('releases an unauthenticated slot after auth timeout without blocking new authed clients', async () => {
  await withVaultCopy(async (vaultRoot) => {
    const token = 'cap-timeout-token';
    const server = createGavetaServer({
      vaultRoot,
      port: 0,
      token,
      webSocketAuthTimeoutMs: 200,
    });
    const address = await server.listen();
    const origin = expectedOrigin(address.port);
    const idle = await openSocket(address.port, origin);
    const closed = new Promise<number>((resolve) => {
      idle.once('close', (code) => {
        resolve(code);
      });
    });
    expect(await closed).toBe(4401);
    const authed = await openSocket(address.port, origin);
    await authSocket(authed, token);
    authed.close();
    await server.close();
  });
});

it('rejects a 33rd authenticated live connection', async () => {
  await withVaultCopy(async (vaultRoot) => {
    const token = 'cap-authed-token';
    const server = createGavetaServer({ vaultRoot, port: 0, token });
    const address = await server.listen();
    const origin = expectedOrigin(address.port);
    const sockets: WebSocket[] = [];
    for (let index = 0; index < WS_MAX_CONNECTIONS; index += 1) {
      const socket = await openSocket(address.port, origin);
      await authSocket(socket, token);
      sockets.push(socket);
    }
    const extra = await openSocket(address.port, origin);
    const rejected = new Promise<number>((resolve) => {
      extra.once('close', (code) => {
        resolve(code);
      });
    });
    extra.send(JSON.stringify({ type: 'auth', token }));
    expect(await rejected).toBe(1013);
    for (const socket of sockets) {
      socket.close();
    }
    await server.close();
  });
});
