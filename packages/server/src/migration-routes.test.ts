import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { markdownVaultPath } from '@gaveta/fixtures';
import { expect, it } from 'vitest';
import { GAVETA_TOKEN_HEADER, createGavetaServer } from './index.ts';
import { requestLocal } from './http-test.ts';
import { resetImportStagingForTests } from './migration/import-staging.ts';
import { withVaultCopy } from './test-helpers.ts';

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
): Promise<{ status: number; body: string }> {
  return requestLocal(
    port,
    path,
    { ...authHeaders(token, port), 'content-type': 'application/json' },
    'POST',
    JSON.stringify(body),
  );
}

async function stageMarkdownTree(
  port: number,
  token: string,
): Promise<{ stagingId: string; preview: unknown }> {
  const staging = await postJson(port, '/api/import/staging', token, {});
  const stagingBody = JSON.parse(staging.body) as { data: { stagingId: string } };
  const stagingId = stagingBody.data.stagingId;
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
      await postJson(port, '/api/import/staging/file', token, {
        stagingId,
        relativePath: relative,
        contentBase64: data.toString('base64'),
      });
    }
  }
  await walk(MARKDOWN);
  const preview = await postJson(port, '/api/import/preview', token, { stagingId });
  return { stagingId, preview: JSON.parse(preview.body) };
}

it('requires auth on migration routes', async () => {
  await withVaultCopy(async (vaultRoot) => {
    const server = createGavetaServer({ vaultRoot, port: 0, token: 'mig-token' });
    const address = await server.listen();
    const response = await requestLocal(address.port, '/api/import/staging', {}, 'POST', '{}');
    expect(response.status).toBe(401);
    await server.close();
    resetImportStagingForTests();
  });
});

it('import preview matches CLI dry-run counts', async () => {
  await withVaultCopy(async (vaultRoot) => {
    const token = 'import-parity';
    const server = createGavetaServer({ vaultRoot, port: 0, token });
    const address = await server.listen();
    const { preview } = await stageMarkdownTree(address.port, token);
    const envelope = preview as {
      ok: boolean;
      data: { dryRun: boolean; summary: { created: number } };
    };
    expect(envelope.ok).toBe(true);
    expect(envelope.data.dryRun).toBe(true);
    expect(envelope.data.summary.created).toBeGreaterThan(20);
    await server.close();
    resetImportStagingForTests();
  });
});

it('rejects unsafe staging paths', async () => {
  await withVaultCopy(async (vaultRoot) => {
    const token = 'import-unsafe';
    const server = createGavetaServer({ vaultRoot, port: 0, token });
    const address = await server.listen();
    const staging = await postJson(address.port, '/api/import/staging', token, {});
    const stagingId = (JSON.parse(staging.body) as { data: { stagingId: string } }).data.stagingId;
    const bad = await postJson(address.port, '/api/import/staging/file', token, {
      stagingId,
      relativePath: '../evil.md',
      contentBase64: Buffer.from('# x\n').toString('base64'),
    });
    expect(bad.status).toBeGreaterThanOrEqual(400);
    expect(bad.body).not.toContain('evil');
    await server.close();
    resetImportStagingForTests();
  });
});

it('export preview matches CLI dry-run for a note', async () => {
  await withVaultCopy(async (vaultRoot) => {
    const token = 'export-parity';
    const server = createGavetaServer({ vaultRoot, port: 0, token });
    const address = await server.listen();
    const response = await postJson(address.port, '/api/export/preview', token, {
      ref: 'nota-x.html',
    });
    const envelope = JSON.parse(response.body) as {
      ok: boolean;
      data: { dryRun: boolean; notes: { path: string }[] };
    };
    expect(envelope.ok).toBe(true);
    expect(envelope.data.dryRun).toBe(true);
    expect(envelope.data.notes[0]?.path).toBe('nota-x.md');
    await server.close();
  });
});

it('export download returns a zip archive', async () => {
  await withVaultCopy(async (vaultRoot) => {
    const token = 'export-zip';
    const server = createGavetaServer({ vaultRoot, port: 0, token });
    const address = await server.listen();
    const response = await requestLocal(
      address.port,
      '/api/export/download',
      { ...authHeaders(token, address.port), 'content-type': 'application/json' },
      'POST',
      JSON.stringify({ ref: 'nota-x.html' }),
    );
    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('application/zip');
    expect(response.body.length).toBeGreaterThan(100);
    await server.close();
  });
});
