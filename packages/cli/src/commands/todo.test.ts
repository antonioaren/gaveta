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
import { commands } from '../registry.ts';
import { runCli, type CliIo } from '../run.ts';

const TASK_NOTE = [
  '<!doctype html>',
  '<html lang="es">',
  '  <head>',
  '    <meta charset="utf-8" />',
  '    <title>Tareas</title>',
  '    <meta name="gaveta:id" content="01JB7Z3K9QX4T5M2N8V6R0WYHC" />',
  '    <meta name="gaveta:type" content="todo" />',
  '    <meta name="gaveta:created" content="2026-10-22T00:00:00.000Z" />',
  '    <link rel="stylesheet" href=".gaveta/theme.css" />',
  '  </head>',
  '  <body>',
  '    <article>',
  '      <h1>Tareas</h1>',
  '      <ul class="tasks">',
  '        <li data-g-task="" id="abierta">',
  '          <input type="checkbox" />',
  '          Abierta',
  '        </li>',
  '      </ul>',
  '    </article>',
  '  </body>',
  '</html>',
  '',
].join('\n');

function argv(...args: string[]): string[] {
  return ['node', 'gaveta', ...args];
}

function capture(overrides: Omit<CliIo, 'stdout' | 'stderr'> = {}): {
  io: CliIo;
  stdout: () => string;
  stderr: () => string;
} {
  let out = '';
  let err = '';
  return {
    io: {
      ...overrides,
      stdout(chunk: string) {
        out += chunk;
      },
      stderr(chunk: string) {
        err += chunk;
      },
    },
    stdout: () => out,
    stderr: () => err,
  };
}

async function withVault(run: (root: string) => Promise<void>): Promise<void> {
  const parent = await mkdtemp(join(tmpdir(), 'gaveta-todo-cli-'));
  try {
    const root = join(parent, 'vault');
    await mkdir(join(root, GAVETA_DIRECTORY), { recursive: true });
    await writeVaultConfig(root, createDefaultVaultConfig());
    await writeFile(join(root, 'tareas.html'), TASK_NOTE);
    await run(root);
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
}

it('registers todo with subcommands', () => {
  const todo = commands.find((command) => command.name === 'todo');
  expect(todo?.subcommands?.map((sub) => sub.name)).toEqual(['add', 'check', 'uncheck', 'list']);
});

it('adds and checks a task with JSON output', async () => {
  await withVault(async (root) => {
    const add = capture({ cwd: root });
    expect(
      await runCli(argv('todo', 'add', 'tareas.html', 'Comprar leche', '--json'), add.io),
    ).toBe(EXIT_CODES.ok);
    const added = JSON.parse(add.stdout()) as { ok: boolean; data: { taskId: string } };
    expect(added.ok).toBe(true);
    expect(added.data.taskId).toBe('comprar-leche');

    const check = capture({ cwd: root });
    expect(await runCli(argv('todo', 'check', 'tareas.html', 'abierta', '--json'), check.io)).toBe(
      EXIT_CODES.ok,
    );
    const checked = JSON.parse(check.stdout()) as { data: { checked: boolean } };
    expect(checked.data.checked).toBe(true);
  });
});

it('lists open tasks for one note', async () => {
  await withVault(async (root) => {
    const listed = capture({ cwd: root });
    expect(await runCli(argv('todo', 'list', 'tareas.html', '--open', '--json'), listed.io)).toBe(
      EXIT_CODES.ok,
    );
    const body = JSON.parse(listed.stdout()) as {
      data: { tasks: { taskId: string | null }[] };
    };
    expect(body.data.tasks).toHaveLength(1);
    expect(body.data.tasks[0]?.taskId).toBe('abierta');
  });
});
