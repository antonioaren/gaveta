import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  EXIT_CODES,
  GAVETA_DIRECTORY,
  createDefaultVaultConfig,
  writeVaultConfig,
} from '@gaveta/core';
import { expect, it } from 'vitest';
import { runCli, type CliIo } from '../run.ts';

const TASK_NOTE = [
  '<!doctype html><html lang="es"><head><meta charset="utf-8" />',
  '<title>Tareas</title>',
  '<meta name="gaveta:id" content="01JB7Z3K9QX4T5M2N8V6R0WYHC" />',
  '<meta name="gaveta:type" content="todo" />',
  '<meta name="gaveta:created" content="2026-10-22T00:00:00.000Z" />',
  '<link rel="stylesheet" href=".gaveta/theme.css" />',
  '</head><body><article><h1>Tareas</h1>',
  '<ul class="tasks"><li data-g-task="" id="abierta"><input type="checkbox" />Abierta</li></ul>',
  '</article></body></html>',
].join('');

function argv(...args: string[]): string[] {
  return ['node', 'gaveta', ...args];
}

function capture(cwd: string): { io: CliIo; stdout: () => string } {
  let out = '';
  return {
    io: {
      cwd,
      env: {},
      stdout(chunk: string) {
        out += chunk;
      },
    },
    stdout: () => out,
  };
}

it('rejects traversal in refs and escapes hostile task text', async () => {
  const parent = await mkdtemp(join(tmpdir(), 'gaveta-todo-sec-'));
  const root = join(parent, 'vault');
  await mkdir(join(root, GAVETA_DIRECTORY), { recursive: true });
  await writeVaultConfig(root, createDefaultVaultConfig());
  await writeFile(join(root, 'tareas.html'), TASK_NOTE);
  try {
    const traversal = capture(root);
    const traversalCode = await runCli(
      argv('todo', 'add', '../fuera', 'x', '--json'),
      traversal.io,
    );
    expect([EXIT_CODES.notFound, EXIT_CODES.usage]).toContain(traversalCode);
    const hostile = capture(root);
    expect(
      await runCli(
        argv('todo', 'add', 'tareas.html', '<img src=x onerror=alert(1)>', '--json'),
        hostile.io,
      ),
    ).toBe(EXIT_CODES.ok);
    const html = await import('node:fs/promises').then((fs) =>
      fs.readFile(join(root, 'tareas.html'), 'utf8'),
    );
    expect(html).toContain('&lt;img');
    expect(html).not.toMatch(/<img[\s>]/);
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});
