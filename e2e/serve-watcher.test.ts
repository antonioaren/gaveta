import { spawn } from 'node:child_process';
import path from 'node:path';
import { writeAtomic } from '@gaveta/core';
import { afterEach, expect, it } from 'vitest';
import WebSocket from 'ws';
import { wsMessageText } from './ws-message.ts';
import {
  GAVETA_BIN,
  initVault,
  parseJson,
  withTempVaultAsync,
  type JsonEnvelope,
} from './helpers.ts';

const children: ReturnType<typeof spawn>[] = [];

afterEach(() => {
  for (const child of children.splice(0)) {
    child.kill('SIGTERM');
  }
});

function startServe(vault: string): Promise<{
  json: JsonEnvelope<{ port: number; token: string }>;
}> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [GAVETA_BIN, 'serve', '--json', '--port', '0'], {
      cwd: vault,
      env: { ...process.env, GAVETA_VAULT: vault },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    children.push(child);
    let stdout = '';
    let settled = false;
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
      if (!settled && stdout.includes('"schemaVersion"')) {
        settled = true;
        try {
          resolve({ json: parseJson(stdout) });
        } catch (error) {
          reject(error instanceof Error ? error : new Error(String(error)));
        }
      }
    });
    child.stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf8');
      if (text.length > 0 && !settled) {
        reject(new Error(text));
      }
    });
    child.on('error', reject);
  });
}

it('T2.2: external atomic edit reaches a live WebSocket client', async () => {
  await withTempVaultAsync(async (vault) => {
    initVault(vault);
    const started = await startServe(vault);
    const { port, token } = started.json.data;
    const origin = `http://127.0.0.1:${String(port)}`;
    const socket = new WebSocket(`ws://127.0.0.1:${String(port)}/api/ws`, {
      headers: { host: `127.0.0.1:${String(port)}`, origin },
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

    const notePath = path.join(vault, 'live.html');
    const changed = new Promise<string>((resolve) => {
      socket.on('message', (data) => {
        const body = JSON.parse(wsMessageText(data)) as { type?: string; path?: string };
        if (body.type === 'note:added' && body.path === 'live.html') {
          resolve(body.path);
        }
      });
    });

    await writeAtomic(
      notePath,
      '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Live</title></head><body><p>hola</p></body></html>',
    );

    expect(await changed).toBe('live.html');
    socket.close();
  });
});
