import { spawn } from 'node:child_process';
import { accessSync, constants, cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ABSENT_NOTE_HASH } from '@gaveta/core';
import { vaultPath } from '@gaveta/fixtures';
import { afterEach, expect, it } from 'vitest';
import {
  GAVETA_BIN,
  parseJson,
  runGaveta,
  withTempVaultAsync,
  type JsonEnvelope,
} from './helpers.ts';
import { requestLocal } from './serve-http.ts';

const BACKLINKS = vaultPath('backlinks');

const children: ReturnType<typeof spawn>[] = [];

afterEach(() => {
  for (const child of children.splice(0)) {
    child.kill('SIGTERM');
  }
});

type ServeEnvelope = JsonEnvelope<{ port: number; token: string }>;

function startServe(vault: string): Promise<{ json: ServeEnvelope }> {
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
          const json: ServeEnvelope = parseJson(stdout);
          resolve({ json });
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
    child.on('exit', (code) => {
      if (!settled && code !== 0) {
        reject(new Error(`serve exited with ${String(code)}`));
      }
    });
  });
}

function cloneVault(parent: string, name: string): string {
  const target = join(parent, name);
  cpSync(BACKLINKS, target, { recursive: true });
  return target;
}

it('T3.13: serve API mkdir matches CLI folder on disk', async () => {
  const parent = mkdtempSync(join(tmpdir(), 'gaveta-e2e-parity-'));
  const apiVault = cloneVault(parent, 'api');
  const cliVault = cloneVault(parent, 'cli');
  try {
    const started = await startServe(apiVault);
    const { port, token } = started.json.data;
    const response = await requestLocal(
      port,
      '/api/folder/mkdir',
      { 'x-gaveta-token': token, 'if-match': ABSENT_NOTE_HASH },
      'POST',
      JSON.stringify({ folder: 'e2e-paridad/carpeta' }),
    );
    expect(response.status).toBe(200);
    runGaveta(['mkdir', 'e2e-paridad/carpeta', '--if-match', ABSENT_NOTE_HASH, '--json'], {
      vault: cliVault,
    });
    expect(() => {
      accessSync(join(apiVault, 'e2e-paridad/carpeta'), constants.F_OK);
    }).not.toThrow();
    expect(() => {
      accessSync(join(cliVault, 'e2e-paridad/carpeta'), constants.F_OK);
    }).not.toThrow();
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
}, 60_000);

it('T3.13: serve API edit matches CLI note bytes', async () => {
  await withTempVaultAsync(async (vault) => {
    cpSync(BACKLINKS, vault, { recursive: true });
    const cliVault = mkdtempSync(join(tmpdir(), 'gaveta-e2e-parity-cli-'));
    cpSync(BACKLINKS, cliVault, { recursive: true });
    try {
      const started = await startServe(vault);
      const { port, token } = started.json.data;
      const read = await requestLocal(port, '/api/read?ref=Nota%20X&as=html', {
        'x-gaveta-token': token,
      });
      const hash = (JSON.parse(read.body) as { data: { hash: string } }).data.hash;
      const snippet = '<p>paridad e2e api</p>';
      const edit = await requestLocal(
        port,
        '/api/edit',
        {
          'x-gaveta-token': token,
          'if-match': hash,
        },
        'POST',
        JSON.stringify({
          ref: 'Nota X',
          mode: 'append',
          section: 'resumen',
          html: snippet,
        }),
      );
      expect(edit.status).toBe(200);
      const cliRead = runGaveta(['read', 'Nota X', '--json'], { vault: cliVault });
      const cliHash = (parseJson(cliRead.stdout).data as { hash: string }).hash;
      runGaveta(
        [
          'edit',
          'Nota X',
          '--section',
          'resumen',
          '--append',
          '--if-match',
          cliHash,
          '--from',
          '-',
          '--json',
        ],
        { vault: cliVault, input: snippet },
      );
      const apiHtml = readFileSync(join(vault, 'nota-x.html'), 'utf8');
      const cliHtml = readFileSync(join(cliVault, 'nota-x.html'), 'utf8');
      expect(apiHtml).toBe(cliHtml);
    } finally {
      rmSync(cliVault, { recursive: true, force: true });
    }
  });
}, 60_000);
