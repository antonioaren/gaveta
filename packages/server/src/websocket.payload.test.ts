import { expect, it } from 'vitest';
import WebSocket from 'ws';
import { expectedOrigin } from './auth.ts';
import { GAVETA_WS_PATH, WS_MAX_MESSAGE_BYTES } from './constants.ts';
import { createGavetaServer } from './index.ts';
import { withVaultCopy } from './test-helpers.ts';

it('rejects an oversized auth frame before buffering the full payload', async () => {
  await withVaultCopy(async (vaultRoot) => {
    const token = 'payload-token';
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
    const oversized = `{"type":"auth","token":"${'a'.repeat(WS_MAX_MESSAGE_BYTES)}"}`;
    expect(Buffer.byteLength(oversized, 'utf8')).toBeGreaterThan(WS_MAX_MESSAGE_BYTES);
    const closed = new Promise<number>((resolve) => {
      socket.once('close', (code) => {
        resolve(code);
      });
    });
    socket.send(oversized);
    expect(await closed).toBe(1009);
    await server.close();
  });
});
