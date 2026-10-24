import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { markdownVaultPath } from '@gaveta/fixtures';
import { expect, it } from 'vitest';
import { GAVETA_TOKEN_HEADER, createGavetaServer } from './index.ts';
import { requestLocal } from './http-test.ts';
import { resetImportStagingForTests } from './migration/import-staging.ts';
import { withVaultCopy } from './test-helpers.ts';

const REPO_ROOT = join(import.meta.dirname, '..', '..');
const MARKDOWN = markdownVaultPath();

function authHeaders(token: string, port: number): Record<string, string> {
  return {
    [GAVETA_TOKEN_HEADER]: token,
    host: `127.0.0.1:${String(port)}`,
  };
}

async function postJson(
  port: number,
  path: string,
  token: string,
  body: Record<string, unknown>,
): Promise<unknown> {
  const response = await requestLocal(
    port,
    path,
    { ...authHeaders(token, port), 'content-type': 'application/json' },
    'POST',
    JSON.stringify(body),
  );
  return JSON.parse(response.body) as unknown;
}

it('import preview summary matches CLI dry-run', async () => {
  await withVaultCopy(async (vaultRoot) => {
    const token = 'cli-api-import';
    const server = createGavetaServer({ vaultRoot, port: 0, token });
    const address = await server.listen();
    const staging = (await postJson(address.port, '/api/import/staging', token, {})) as {
      data: { stagingId: string };
    };
    const stagingId = staging.data.stagingId;
    const { readdir } = await import('node:fs/promises');
    async function walk(dir: string, prefix = ''): Promise<void> {
      const entries = await readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name === '.obsidian') {
          continue;
        }
        const relative = prefix.length === 0 ? entry.name : `${prefix}/${entry.name}`;
        const absolute = join(dir, entry.name);
        if (entry.isDirectory()) {
          await walk(absolute, relative);
          continue;
        }
        if (!entry.isFile()) {
          continue;
        }
        const data = await readFile(absolute);
        await postJson(address.port, '/api/import/staging/file', token, {
          stagingId,
          relativePath: relative,
          contentBase64: data.toString('base64'),
        });
      }
    }
    await walk(MARKDOWN);
    const apiEnvelope = (await postJson(address.port, '/api/import/preview', token, {
      stagingId,
    })) as { data: { summary: { created: number } } };

    const cli = spawnSync('pnpm', ['exec', 'gaveta', 'import', MARKDOWN, '--dry-run', '--json'], {
      cwd: REPO_ROOT,
      env: { ...process.env, GAVETA_VAULT: vaultRoot },
      encoding: 'utf8',
    });
    expect(cli.status).toBe(0);
    const cliEnvelope = JSON.parse(cli.stdout) as { data: { summary: { created: number } } };
    expect(apiEnvelope.data.summary.created).toBe(cliEnvelope.data.summary.created);
    await server.close();
    resetImportStagingForTests();
  });
});
