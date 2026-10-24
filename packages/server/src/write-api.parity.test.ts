import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { ABSENT_NOTE_HASH, readVaultText } from '@gaveta/core';
import { expect, it } from 'vitest';
import { GAVETA_TOKEN_HEADER, createGavetaServer } from './index.ts';
import { requestLocal } from './http-test.ts';
import { withVaultCopy } from './test-helpers.ts';

const REPO_ROOT = join(import.meta.dirname, '..', '..');

function authHeaders(token: string, port: number): Record<string, string> {
  return {
    [GAVETA_TOKEN_HEADER]: token,
    host: `127.0.0.1:${String(port)}`,
  };
}

function postJson(
  port: number,
  path: string,
  token: string,
  body: Record<string, unknown>,
  ifMatch: string,
): Promise<{ status: number; body: string }> {
  return requestLocal(
    port,
    path,
    { ...authHeaders(token, port), 'if-match': ifMatch },
    'POST',
    JSON.stringify(body),
  );
}

async function noteHash(port: number, token: string, ref: string): Promise<string> {
  const response = await requestLocal(
    port,
    `/api/read?ref=${encodeURIComponent(ref)}&as=html`,
    authHeaders(token, port),
  );
  const parsed = JSON.parse(response.body) as { ok: boolean; data: { hash: string } };
  return parsed.data.hash;
}

function cloneVault(source: string, name: string): string {
  const target = join(source, '..', name);
  mkdirSync(target, { recursive: true });
  cpSync(source, target, { recursive: true });
  return target;
}

function gaveta(vaultRoot: string, args: readonly string[], input?: string): void {
  const result = spawnSync('pnpm', ['exec', 'gaveta', ...args], {
    cwd: REPO_ROOT,
    env: { ...process.env, GAVETA_VAULT: vaultRoot },
    encoding: 'utf8',
    input,
  });
  expect(result.status).toBe(0);
}

function cliHash(vaultRoot: string, ref: string): string {
  const result = spawnSync('pnpm', ['exec', 'gaveta', 'read', ref, '--json'], {
    cwd: REPO_ROOT,
    env: { ...process.env, GAVETA_VAULT: vaultRoot },
    encoding: 'utf8',
  });
  expect(result.status).toBe(0);
  const envelope = JSON.parse(result.stdout) as { data: { hash: string } };
  return envelope.data.hash;
}

it('edit via API matches CLI bytes', async () => {
  await withVaultCopy(async (vaultRoot) => {
    const cliVault = cloneVault(vaultRoot, 'cli-edit');
    const token = 'parity-edit';
    const server = createGavetaServer({ vaultRoot, port: 0, token });
    const address = await server.listen();
    const hash = await noteHash(address.port, token, 'Nota X');
    const snippet = '<p>paridad edit api</p>';
    const api = await postJson(
      address.port,
      '/api/edit',
      token,
      { ref: 'Nota X', mode: 'append', section: 'resumen', html: snippet },
      hash,
    );
    expect(api.status).toBe(200);
    gaveta(
      cliVault,
      [
        'edit',
        'Nota X',
        '--section',
        'resumen',
        '--append',
        '--if-match',
        cliHash(cliVault, 'Nota X'),
        '--from',
        '-',
        '--json',
      ],
      snippet,
    );
    expect(await readVaultText(vaultRoot, 'nota-x.html')).toBe(
      await readVaultText(cliVault, 'nota-x.html'),
    );
    await server.close();
  });
});

it('link via API matches CLI bytes', async () => {
  await withVaultCopy(async (vaultRoot) => {
    const cliVault = cloneVault(vaultRoot, 'cli-link');
    const token = 'parity-link';
    const server = createGavetaServer({ vaultRoot, port: 0, token });
    const address = await server.listen();
    const fromHash = await noteHash(address.port, token, 'Formas de enlace');
    const api = await postJson(
      address.port,
      '/api/link',
      token,
      { from: 'Formas de enlace', to: 'Destino enlace', rel: 'related' },
      fromHash,
    );
    expect(api.status).toBe(200);
    gaveta(cliVault, [
      'link',
      'Formas de enlace',
      'Destino enlace',
      '--rel',
      'related',
      '--if-match',
      cliHash(cliVault, 'Formas de enlace'),
      '--json',
    ]);
    expect(await readVaultText(vaultRoot, 'formas-de-enlace.html')).toBe(
      await readVaultText(cliVault, 'formas-de-enlace.html'),
    );
    await server.close();
  });
});

it('todo add via API matches CLI bytes', async () => {
  await withVaultCopy(async (vaultRoot) => {
    const cliVault = cloneVault(vaultRoot, 'cli-todo');
    const token = 'parity-todo';
    const server = createGavetaServer({ vaultRoot, port: 0, token });
    const address = await server.listen();
    const hash = await noteHash(address.port, token, 'Nota X');
    const api = await postJson(
      address.port,
      '/api/todo/add',
      token,
      { ref: 'Nota X', text: 'Comprar leche API' },
      hash,
    );
    expect(api.status).toBe(200);
    gaveta(cliVault, [
      'todo',
      'add',
      'Nota X',
      'Comprar leche API',
      '--if-match',
      cliHash(cliVault, 'Nota X'),
      '--json',
    ]);
    expect(await readVaultText(vaultRoot, 'nota-x.html')).toBe(
      await readVaultText(cliVault, 'nota-x.html'),
    );
    await server.close();
  });
});

it('mv via API matches CLI bytes', async () => {
  await withVaultCopy(async (vaultRoot) => {
    const cliVault = cloneVault(vaultRoot, 'cli-mv');
    const token = 'parity-mv';
    const server = createGavetaServer({ vaultRoot, port: 0, token });
    const address = await server.listen();
    const hash = await noteHash(address.port, token, 'Destino enlace');
    const api = await postJson(
      address.port,
      '/api/mv',
      token,
      { ref: 'Destino enlace', destination: 'movidos/destino-enlace.html' },
      hash,
    );
    expect(api.status).toBe(200);
    gaveta(cliVault, [
      'mv',
      'Destino enlace',
      'movidos/destino-enlace.html',
      '--if-match',
      cliHash(cliVault, 'Destino enlace'),
      '--json',
    ]);
    expect(await readVaultText(vaultRoot, 'movidos/destino-enlace.html')).toBe(
      await readVaultText(cliVault, 'movidos/destino-enlace.html'),
    );
    await server.close();
  });
});

it('todo check via API matches CLI bytes', async () => {
  await withVaultCopy(async (vaultRoot) => {
    const cliVault = cloneVault(vaultRoot, 'cli-todo-check');
    const token = 'parity-todo-check';
    const server = createGavetaServer({ vaultRoot, port: 0, token });
    const address = await server.listen();
    const ref = 'enlaces/mas/enlace-20.html';
    const hash = await noteHash(address.port, token, ref);
    const api = await postJson(
      address.port,
      '/api/todo/check',
      token,
      { ref, taskId: 'revisar' },
      hash,
    );
    expect(api.status).toBe(200);
    gaveta(cliVault, [
      'todo',
      'check',
      ref,
      'revisar',
      '--if-match',
      cliHash(cliVault, ref),
      '--json',
    ]);
    expect(await readVaultText(vaultRoot, ref)).toBe(await readVaultText(cliVault, ref));
    await server.close();
  });
});

it('mkdir via API matches CLI folder', async () => {
  await withVaultCopy(async (vaultRoot) => {
    const cliVault = cloneVault(vaultRoot, 'cli-mkdir');
    const token = 'parity-mkdir';
    const server = createGavetaServer({ vaultRoot, port: 0, token });
    const address = await server.listen();
    const api = await postJson(
      address.port,
      '/api/folder/mkdir',
      token,
      { folder: 'paridad/carpeta' },
      ABSENT_NOTE_HASH,
    );
    expect(api.status).toBe(200);
    gaveta(cliVault, ['mkdir', 'paridad/carpeta', '--if-match', ABSENT_NOTE_HASH, '--json']);
    const { access } = await import('node:fs/promises');
    await expect(access(`${vaultRoot}/paridad/carpeta`)).resolves.toBeUndefined();
    await expect(access(`${cliVault}/paridad/carpeta`)).resolves.toBeUndefined();
    await server.close();
  });
});

it('meta via API matches CLI bytes', async () => {
  await withVaultCopy(async (vaultRoot) => {
    const cliVault = cloneVault(vaultRoot, 'cli-meta');
    const token = 'parity-meta';
    const server = createGavetaServer({ vaultRoot, port: 0, token });
    const address = await server.listen();
    const hash = await noteHash(address.port, token, 'Nota X');
    const api = await postJson(
      address.port,
      '/api/meta',
      token,
      { ref: 'Nota X', tags: ['api', 'meta'], aliases: ['Equis'] },
      hash,
    );
    expect(api.status).toBe(200);
    gaveta(cliVault, [
      'meta',
      'Nota X',
      '--tags',
      'api, meta',
      '--aliases',
      'Equis',
      '--if-match',
      cliHash(cliVault, 'Nota X'),
      '--json',
    ]);
    expect(await readVaultText(vaultRoot, 'nota-x.html')).toBe(
      await readVaultText(cliVault, 'nota-x.html'),
    );
    await server.close();
  });
});

it('rm via API matches CLI bytes', async () => {
  await withVaultCopy(async (vaultRoot) => {
    const cliVault = cloneVault(vaultRoot, 'cli-rm');
    const token = 'parity-rm';
    const server = createGavetaServer({ vaultRoot, port: 0, token });
    const address = await server.listen();
    const hash = await noteHash(address.port, token, 'Destino enlace');
    const api = await postJson(
      address.port,
      '/api/rm',
      token,
      { ref: 'Destino enlace', force: true },
      hash,
    );
    expect(api.status).toBe(200);
    gaveta(cliVault, ['rm', 'Destino enlace', '--force', '--json']);
    await expect(readVaultText(vaultRoot, 'destino-enlace.html')).rejects.toThrow();
    await expect(readVaultText(cliVault, 'destino-enlace.html')).rejects.toThrow();
    await server.close();
  });
});
