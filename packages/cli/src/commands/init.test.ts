import { createHash } from 'node:crypto';
import { mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  EXIT_CODES,
  GAVETA_DIRECTORY,
  GAVETA_VAULT_ENV,
  createDefaultVaultConfig,
  writeVaultConfig,
} from '@gaveta/core';
import { expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { runCli, type CliIo } from '../run.ts';

async function withTemp(run: (directory: string) => Promise<void>): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), 'gaveta-cli-init-'));
  try {
    await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
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

function argv(...args: string[]): string[] {
  return ['node', 'gaveta', ...args];
}

it('creates the vault at --vault or GAVETA_VAULT when no positional dir is given', async () => {
  await withTemp(async (parent) => {
    const cwd = join(parent, 'cwd');
    const byOption = join(parent, 'by-option');
    const byEnv = join(parent, 'by-env');
    await mkdir(cwd);

    const optionRun = capture({ cwd, env: {} });
    expect(await runCli(argv('init', '--json', '--vault', byOption), optionRun.io)).toBe(
      EXIT_CODES.ok,
    );
    expect(JSON.parse(optionRun.stdout())).toMatchObject({
      data: { root: await realpath(byOption) },
    });
    expect(optionRun.stderr()).toBe('');

    const envRun = capture({ cwd, env: { [GAVETA_VAULT_ENV]: byEnv } });
    expect(await runCli(argv('init', '--json'), envRun.io)).toBe(EXIT_CODES.ok);
    expect(JSON.parse(envRun.stdout())).toMatchObject({
      data: { root: await realpath(byEnv) },
    });
    expect(envRun.stderr()).toBe('');

    const positional = join(parent, 'positional');
    const both = capture({ cwd, env: { [GAVETA_VAULT_ENV]: byEnv } });
    expect(await runCli(argv('init', '--json', '--vault', byOption, positional), both.io)).toBe(
      EXIT_CODES.ok,
    );
    expect(JSON.parse(both.stdout())).toMatchObject({
      data: { root: await realpath(positional) },
    });
  });
});

it('prints a Spanish init envelope and leaves an existing note untouched', async () => {
  await withTemp(async (parent) => {
    const root = join(parent, 'vault');
    await mkdir(root);
    const html = '<p>intacto</p>';
    await writeFile(join(root, 'keep.html'), html);

    const created = capture({ cwd: root, env: {} });
    expect(await runCli(argv('init', '--json'), created.io)).toBe(EXIT_CODES.ok);
    expect(created.stderr()).toBe('');
    expect(JSON.parse(created.stdout())).toEqual({
      ok: true,
      schemaVersion: 1,
      command: 'init',
      data: {
        root: await realpath(root),
        created: ['.gaveta/config.json', '.gaveta/theme.css', '.gaveta/index.sqlite'],
        preserved: [],
        agentInstructions: null,
      },
      warnings: [],
    });
    expect(await readFile(join(root, 'keep.html'), 'utf8')).toBe(html);

    const again = capture({ cwd: root, env: {} });
    expect(await runCli(argv('--json', 'init'), again.io)).toBe(EXIT_CODES.ok);
    expect(JSON.parse(again.stdout())).toMatchObject({
      ok: true,
      schemaVersion: 1,
      command: 'init',
      data: {
        created: [],
        preserved: ['.gaveta/config.json', '.gaveta/theme.css', '.gaveta/index.sqlite'],
        agentInstructions: null,
      },
    });

    const human = capture({ cwd: root, env: {} });
    expect(await runCli(argv('init'), human.io)).toBe(EXIT_CODES.ok);
    expect(human.stdout()).toContain('El vault ya existe');
    expect(human.stdout().startsWith('{')).toBe(false);
    expect(human.stderr()).toBe('');
  });
});

it('writes one idempotent agent block and rejects later targets', async () => {
  await withTemp(async (parent) => {
    const root = join(parent, 'vault');
    await mkdir(root);
    await writeFile(join(root, 'AGENTS.md'), '# Proyecto\n\nTexto previo.\n');

    const first = capture({ cwd: root, env: {} });
    expect(await runCli(argv('init', '--agent-instructions', 'agents', '--json'), first.io)).toBe(
      EXIT_CODES.ok,
    );
    expect(JSON.parse(first.stdout())).toMatchObject({
      data: { agentInstructions: { target: 'agents', path: 'AGENTS.md', changed: true } },
    });
    const text = await readFile(join(root, 'AGENTS.md'), 'utf8');
    expect(text).toContain('# Proyecto');
    expect(text).toContain('<!-- gaveta:start -->');
    expect(text).toContain('<!-- gaveta:end -->');
    expect(text.indexOf('<!-- gaveta:start -->')).toBe(text.lastIndexOf('<!-- gaveta:start -->'));

    const second = capture({ cwd: root, env: {} });
    expect(await runCli(argv('init', '--agent-instructions', 'agents', '--json'), second.io)).toBe(
      EXIT_CODES.ok,
    );
    expect(JSON.parse(second.stdout())).toMatchObject({
      data: { agentInstructions: { changed: false } },
    });
    expect(await readFile(join(root, 'AGENTS.md'), 'utf8')).toBe(text);

    const rejected = capture({ cwd: root, env: {} });
    expect(
      await runCli(argv('--json', 'init', '--agent-instructions', 'cursor'), rejected.io),
    ).toBe(EXIT_CODES.usage);
    expect(JSON.parse(rejected.stdout())).toMatchObject({
      ok: false,
      schemaVersion: 1,
      command: 'init',
      error: { code: 'E_ARG_INVALID' },
    });
    expect(rejected.stderr()).toBe('');
  });
});

it('adopts a note into the index and refuses traversal', async () => {
  await withTemp(async (parent) => {
    const root = join(parent, 'vault');
    await mkdir(join(root, GAVETA_DIRECTORY), { recursive: true });
    await writeVaultConfig(root, createDefaultVaultConfig());
    await writeFile(join(root, 'nota.html'), '<h1>Café</h1><p>Hola</p>');
    await writeFile(join(parent, 'secret.html'), '<p>secret</p>');

    const adopted = capture({ cwd: root, env: {} });
    expect(await runCli(argv('adopt', 'nota.html', '--json'), adopted.io)).toBe(EXIT_CODES.ok);
    expect(adopted.stderr()).toBe('');
    const body = JSON.parse(adopted.stdout()) as {
      ok: boolean;
      schemaVersion: number;
      command: string;
      data: { id: string; path: string; hash: string; type: string; title: string };
      warnings: unknown[];
    };
    expect(body.ok).toBe(true);
    expect(body.schemaVersion).toBe(1);
    expect(body.command).toBe('adopt');
    expect(body.data.path).toBe('nota.html');
    expect(body.data.type).toBe('doc');
    expect(body.data.title).toBe('Café');
    expect(body.data.id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
    const html = await readFile(join(root, 'nota.html'), 'utf8');
    expect(html).toContain(body.data.id);
    expect(body.data.hash).toBe(
      `sha256:${createHash('sha256').update(html, 'utf8').digest('hex')}`,
    );
    expect(await readFile(join(parent, 'secret.html'), 'utf8')).toBe('<p>secret</p>');

    const outside = capture({ cwd: root, env: {} });
    expect(await runCli(argv('--json', 'adopt', '../secret.html'), outside.io)).toBe(
      EXIT_CODES.usage,
    );
    expect(JSON.parse(outside.stdout())).toMatchObject({
      ok: false,
      command: 'adopt',
      error: { code: 'E_PATH_OUTSIDE_VAULT' },
    });
    expect(await readFile(join(parent, 'secret.html'), 'utf8')).toBe('<p>secret</p>');

    const missing = capture({ cwd: parent, env: {} });
    expect(await runCli(argv('adopt', 'nota.html', '--json'), missing.io)).toBe(
      EXIT_CODES.notFound,
    );
    expect(JSON.parse(missing.stdout())).toMatchObject({
      error: { code: 'E_VAULT_NOT_FOUND' },
    });
  });
});

it('initializes the given directory when GAVETA_VAULT points to a vault that does not exist yet', async () => {
  await withTemp(async (parent) => {
    const root = join(parent, 'nuevo');

    const created = capture({ cwd: parent, env: { GAVETA_VAULT: root } });
    expect(await runCli(argv('init', root, '--json'), created.io)).toBe(EXIT_CODES.ok);

    expect(JSON.parse(created.stdout())).toMatchObject({
      ok: true,
      command: 'init',
      data: { root: await realpath(root) },
    });
  });
});
