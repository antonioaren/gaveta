import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { expect, it } from 'vitest';
import { listMcpToolDefinitions } from '../packages/cli/src/mcp/tool-definitions.ts';
import { commands } from '../packages/cli/src/registry.ts';
import { parseJson, withTempVaultAsync, type JsonEnvelope } from './helpers.ts';

const root = join(import.meta.dirname, '..');
const bin = join(root, 'packages/cli/bin/gaveta.js');

function toolResultText(result: unknown): string {
  if (typeof result !== 'object' || result === null || !('content' in result)) {
    return '';
  }
  const envelope = result as Record<string, unknown>;
  const content = envelope.content;
  if (!Array.isArray(content) || content.length === 0) {
    return '';
  }
  const first: unknown = content[0];
  if (typeof first !== 'object' || first === null) {
    return '';
  }
  const block = first as { type?: unknown; text?: unknown };
  if (block.type !== 'text' || typeof block.text !== 'string') {
    return '';
  }
  return block.text;
}

async function withMcpClient<T>(
  env: Record<string, string>,
  cwd: string,
  run: (client: Client) => Promise<T>,
): Promise<T> {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [bin, 'mcp'],
    cwd,
    env: { ...process.env, GAVETA_LANG: 'en', ...env },
    stderr: 'pipe',
  });
  const client = new Client({ name: 'gaveta-e2e', version: '0.0.0' });
  await client.connect(transport);
  try {
    return await run(client);
  } finally {
    await client.close();
  }
}

it('lists MCP tools for every CLI leaf command except mcp and serve', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'gaveta-mcp-list-'));
  try {
    await withMcpClient({}, directory, async (client) => {
      const listed = await client.listTools();
      const names = listed.tools.map((tool) => tool.name).sort();
      const expected = listMcpToolDefinitions(commands)
        .map((tool) => tool.name)
        .sort();
      expect(names).toEqual(expected);
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

it('runs create, read, search, import, and export round-trips over stdio', async () => {
  const parent = mkdtempSync(join(tmpdir(), 'gaveta-mcp-rt-'));
  const vault = join(parent, 'vault');
  const markdownDir = join(parent, 'md-in');
  const exportDir = join(parent, 'md-out');
  mkdirSync(markdownDir, { recursive: true });
  try {
    await withMcpClient({ GAVETA_VAULT: vault }, parent, async (client) => {
      const init = await client.callTool({
        name: 'init',
        arguments: { vault },
      });
      const initBody = parseJson<JsonEnvelope>(toolResultText(init));
      expect(initBody.ok).toBe(true);

      const created = await client.callTool({
        name: 'new',
        arguments: {
          título: 'Round trip',
          type: 'doc',
          vault,
          content:
            '<article><h1>Round trip</h1><section id="cuerpo"><p>[[Other]]</p></section></article>',
        },
      });
      const createdBody = parseJson<{ title: string }>(toolResultText(created));
      expect(createdBody.ok).toBe(true);
      expect(createdBody.data.title).toBe('Round trip');

      const read = await client.callTool({
        name: 'read',
        arguments: { ref: 'Round trip', as: 'text', vault },
      });
      const readBody = parseJson<{ text: string }>(toolResultText(read));
      expect(readBody.ok).toBe(true);
      expect(readBody.data.text).toContain('Other');

      const search = await client.callTool({
        name: 'search',
        arguments: { consulta: 'Round', vault, limit: '5' },
      });
      const searchBody = parseJson<JsonEnvelope>(toolResultText(search));
      expect(searchBody.ok).toBe(true);
      const searchData = searchBody.data as unknown as { hits: unknown };
      expect(Array.isArray(searchData.hits) && searchData.hits.length > 0).toBe(true);

      writeFileSync(
        join(markdownDir, 'imported.md'),
        '# Imported\n\nBody from markdown.\n',
        'utf8',
      );
      const imported = await client.callTool({
        name: 'import',
        arguments: { ruta: join(markdownDir, 'imported.md'), vault },
      });
      const importedBody = parseJson<JsonEnvelope>(toolResultText(imported));
      expect(importedBody.ok).toBe(true);

      const exported = await client.callTool({
        name: 'export',
        arguments: {
          ref: 'Imported',
          to: 'md',
          out: exportDir,
          vault,
        },
      });
      const exportedBody = parseJson<JsonEnvelope>(toolResultText(exported));
      expect(exportedBody.ok).toBe(true);
      expect(readFileSync(join(exportDir, 'imported.md'), 'utf8')).toContain('Imported');
    });
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

it('rejects path traversal in MCP read arguments', async () => {
  await withTempVaultAsync(
    async (vault) => {
      const parent = join(vault, '..');
      await withMcpClient({ GAVETA_VAULT: vault }, parent, async (client) => {
        const result = await client.callTool({
          name: 'read',
          arguments: { ref: '../../../etc/passwd', vault },
        });
        const body = parseJson<JsonEnvelope>(toolResultText(result));
        expect(body.ok).toBe(false);
        expect(result.isError).toBe(true);
      });
    },
    { fixture: 'empty' },
  );
});
