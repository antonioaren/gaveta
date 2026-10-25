import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EXIT_CODES } from '@gaveta/core';
import { expect, it } from 'vitest';
import { findMcpToolDefinition } from './tool-definitions.ts';
import { buildCliArgvFromMcpArgs, invokeMcpTool } from './invoke.ts';
import { commands } from '../registry.ts';

it('builds argv with globals, options, and stdin content', () => {
  const tool = findMcpToolDefinition(commands, 'new');
  expect(tool).toBeDefined();
  if (tool === undefined) {
    return;
  }
  const built = buildCliArgvFromMcpArgs(tool, {
    titulo: 'Hola',
    type: 'doc',
    vault: '/tmp/v',
    content: '<article><h1>Hola</h1></article>',
  });
  expect(built.argv).toEqual([
    'new',
    'Hola',
    '--type',
    'doc',
    '--vault',
    '/tmp/v',
    '--from',
    '-',
    '--json',
  ]);
  expect(built.stdinText).toContain('<article>');
});

it('rejects path traversal in read via MCP tool', async () => {
  const parent = mkdtempSync(join(tmpdir(), 'gaveta-mcp-sec-'));
  const vault = join(parent, 'vault');
  try {
    const tool = findMcpToolDefinition(commands, 'read');
    expect(tool).toBeDefined();
    if (tool === undefined) {
      return;
    }
    const result = await invokeMcpTool(
      tool,
      { ref: '../../../etc/passwd', vault },
      { cwd: parent, env: { ...process.env, GAVETA_LANG: 'en' } },
    );
    expect(result.exitCode).not.toBe(EXIT_CODES.ok);
    const envelope = JSON.parse(result.stdout) as { ok: boolean; error?: { code: string } };
    expect(envelope.ok).toBe(false);
    expect(envelope.error?.code).toBeDefined();
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

it('invokes new through the same JSON envelope as the CLI', async () => {
  const parent = mkdtempSync(join(tmpdir(), 'gaveta-mcp-new-'));
  const vault = join(parent, 'vault');
  try {
    const initTool = findMcpToolDefinition(commands, 'init');
    expect(initTool).toBeDefined();
    if (initTool === undefined) {
      return;
    }
    const init = await invokeMcpTool(
      initTool,
      { vault },
      { cwd: parent, env: { GAVETA_LANG: 'en' } },
    );
    expect(init.exitCode).toBe(EXIT_CODES.ok);

    const tool = findMcpToolDefinition(commands, 'new');
    expect(tool).toBeDefined();
    if (tool === undefined) {
      return;
    }
    const created = await invokeMcpTool(
      tool,
      {
        titulo: 'MCP note',
        type: 'doc',
        vault,
        content: '<article><h1>MCP note</h1><section id="cuerpo"><p>Body</p></section></article>',
      },
      { cwd: parent, env: { GAVETA_LANG: 'en' } },
    );
    expect(created.exitCode).toBe(EXIT_CODES.ok);
    const envelope = JSON.parse(created.stdout) as {
      ok: boolean;
      schemaVersion: number;
      command: string;
      data: { title: string };
    };
    expect(envelope.ok).toBe(true);
    expect(envelope.schemaVersion).toBe(1);
    expect(envelope.command).toBe('new');
    expect(envelope.data.title).toBe('MCP note');
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});
