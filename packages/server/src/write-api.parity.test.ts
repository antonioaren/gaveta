import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { ABSENT_NOTE_HASH, noteContentHash, readVaultText } from '@gaveta/core';
import { expect, it } from 'vitest';
import { GAVETA_TOKEN_HEADER, createGavetaServer } from './index.ts';
import { requestLocal } from './http-test.ts';
import { stripVolatileNoteHtml } from './parity-html.ts';
import {
  MENTION_PARITY_SOURCE_PATH,
  MENTION_PARITY_TARGET_REF,
  seedMentionParityNotes,
} from './parity-seed.ts';
import { withVaultCopy } from './test-helpers.ts';

const STABLE_ID = '01JB7Z3K9QX4T5M2N8V6R0WYHF';
const STABLE_NOW = '2026-10-22T12:00:00Z';

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

function reindex(vaultRoot: string): void {
  gaveta(vaultRoot, ['reindex', '--json']);
}

function gaveta(vaultRoot: string, args: readonly string[], input?: string): void {
  const result = spawnSync('pnpm', ['exec', 'gaveta', ...args], {
    cwd: REPO_ROOT,
    env: { ...process.env, GAVETA_VAULT: vaultRoot },
    encoding: 'utf8',
    input,
  });
  expect(result.status, result.stderr || result.stdout).toBe(0);
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

it('new via API matches CLI bytes aside from id and timestamps', async () => {
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const parent = mkdtempSync(join(tmpdir(), 'gaveta-parity-new-'));
  const vaultRoot = join(parent, 'api');
  const cliVault = join(parent, 'cli');
  mkdirSync(vaultRoot, { recursive: true });
  mkdirSync(cliVault, { recursive: true });
  gaveta(vaultRoot, ['init', '--json']);
  gaveta(cliVault, ['init', '--json']);
  try {
    const token = 'parity-new';
    const server = createGavetaServer({ vaultRoot, port: 0, token });
    const address = await server.listen();
    const api = await postJson(
      address.port,
      '/api/new',
      token,
      {
        title: 'Paridad API',
        type: 'doc',
        in: 'carpeta',
        tags: 'alpha,beta',
        id: STABLE_ID,
        now: STABLE_NOW,
      },
      ABSENT_NOTE_HASH,
    );
    expect(api.status).toBe(200);
    gaveta(cliVault, [
      'new',
      'Paridad API',
      '--type',
      'doc',
      '--in',
      'carpeta',
      '--tags',
      'alpha,beta',
      '--json',
    ]);
    const apiPath = 'carpeta/paridad-api.html';
    const apiHtml = await readVaultText(vaultRoot, apiPath);
    const cliHtml = await readVaultText(cliVault, apiPath);
    expect(stripVolatileNoteHtml(apiHtml)).toBe(stripVolatileNoteHtml(cliHtml));
    await server.close();
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

it('todo uncheck via API matches CLI bytes', async () => {
  await withVaultCopy(async (vaultRoot) => {
    const cliVault = cloneVault(vaultRoot, 'cli-todo-uncheck');
    const token = 'parity-todo-uncheck';
    const server = createGavetaServer({ vaultRoot, port: 0, token });
    const address = await server.listen();
    const ref = 'enlaces/mas/enlace-20.html';
    let hash = await noteHash(address.port, token, ref);
    await postJson(address.port, '/api/todo/check', token, { ref, taskId: 'revisar' }, hash);
    hash = await noteHash(address.port, token, ref);
    const api = await postJson(
      address.port,
      '/api/todo/uncheck',
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
    gaveta(cliVault, [
      'todo',
      'uncheck',
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

it('folder mv via API matches CLI bytes', async () => {
  await withVaultCopy(async (vaultRoot) => {
    const cliVault = cloneVault(vaultRoot, 'cli-folder-mv');
    const token = 'parity-folder-mv';
    const server = createGavetaServer({ vaultRoot, port: 0, token });
    const address = await server.listen();
    const api = await postJson(
      address.port,
      '/api/folder/mv',
      token,
      { folder: 'enlaces', destination: 'renombrados' },
      ABSENT_NOTE_HASH,
    );
    expect(api.status).toBe(200);
    gaveta(cliVault, [
      'mv-folder',
      'enlaces',
      'renombrados',
      '--if-match',
      ABSENT_NOTE_HASH,
      '--json',
    ]);
    expect(await readVaultText(vaultRoot, 'renombrados/enlace-01.html')).toBe(
      await readVaultText(cliVault, 'renombrados/enlace-01.html'),
    );
    await server.close();
  });
});

it('folder rm via API matches CLI removal', async () => {
  await withVaultCopy(async (vaultRoot) => {
    const cliVault = cloneVault(vaultRoot, 'cli-folder-rm');
    seedMentionParityNotes(vaultRoot);
    seedMentionParityNotes(cliVault);
    reindex(vaultRoot);
    reindex(cliVault);
    gaveta(vaultRoot, ['mkdir', 'paridad/aislado', '--if-match', ABSENT_NOTE_HASH, '--json']);
    gaveta(cliVault, ['mkdir', 'paridad/aislado', '--if-match', ABSENT_NOTE_HASH, '--json']);
    gaveta(vaultRoot, [
      'new',
      'Solo Aislado',
      '--type',
      'doc',
      '--in',
      'paridad/aislado',
      '--json',
    ]);
    gaveta(cliVault, ['new', 'Solo Aislado', '--type', 'doc', '--in', 'paridad/aislado', '--json']);
    reindex(vaultRoot);
    reindex(cliVault);
    const token = 'parity-folder-rm';
    const server = createGavetaServer({ vaultRoot, port: 0, token });
    const address = await server.listen();
    const api = await postJson(
      address.port,
      '/api/folder/rm',
      token,
      { folder: 'paridad/aislado', force: true },
      ABSENT_NOTE_HASH,
    );
    expect(api.status).toBe(200);
    gaveta(cliVault, [
      'rm-folder',
      'paridad/aislado',
      '--force',
      '--if-match',
      ABSENT_NOTE_HASH,
      '--json',
    ]);
    await expect(readVaultText(vaultRoot, 'paridad/aislado/solo-aislado.html')).rejects.toThrow();
    await expect(readVaultText(cliVault, 'paridad/aislado/solo-aislado.html')).rejects.toThrow();
    await server.close();
  });
});

it('mentions link via API matches CLI bytes', async () => {
  await withVaultCopy(async (vaultRoot) => {
    const cliVault = cloneVault(vaultRoot, 'cli-mentions');
    seedMentionParityNotes(vaultRoot);
    seedMentionParityNotes(cliVault);
    reindex(vaultRoot);
    reindex(cliVault);
    const token = 'parity-mentions';
    const server = createGavetaServer({ vaultRoot, port: 0, token });
    const address = await server.listen();
    const sourceHash = noteContentHash(await readVaultText(vaultRoot, MENTION_PARITY_SOURCE_PATH));
    const api = await requestLocal(
      address.port,
      '/api/mentions/link',
      { ...authHeaders(token, address.port), 'content-type': 'application/json' },
      'POST',
      JSON.stringify({
        ref: MENTION_PARITY_TARGET_REF,
        sources: [{ from: 'Uno Parity', ifMatch: sourceHash }],
      }),
    );
    expect(api.status).toBe(200);
    gaveta(cliVault, ['mentions', MENTION_PARITY_TARGET_REF, '--link', '--json']);
    expect(await readVaultText(vaultRoot, MENTION_PARITY_SOURCE_PATH)).toBe(
      await readVaultText(cliVault, MENTION_PARITY_SOURCE_PATH),
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
