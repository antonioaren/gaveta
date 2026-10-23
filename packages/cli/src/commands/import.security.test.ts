import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
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

interface Envelope {
  readonly ok: boolean;
  readonly error?: { readonly code: string };
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
      stderr() {
        return undefined;
      },
    },
    stdout: () => out,
  };
}

function argv(...args: string[]): string[] {
  return ['node', 'gaveta', ...args];
}

async function withTemp(run: (directory: string) => Promise<void>): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), 'gaveta-import-sec-'));
  try {
    await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function makeVault(parent: string): Promise<string> {
  const root = join(parent, 'vault');
  await mkdir(join(root, GAVETA_DIRECTORY), { recursive: true });
  await writeVaultConfig(root, createDefaultVaultConfig());
  return root;
}

it('rejects a markdown tree whose symlink escapes the source root', async () => {
  await withTemp(async (parent) => {
    const vault = await makeVault(parent);
    const outside = join(parent, 'outside');
    await mkdir(outside);
    await writeFile(join(outside, 'evil.md'), '# Evil\n');
    const tree = join(parent, 'tree');
    await mkdir(tree);
    await symlink(outside, join(tree, 'escape'));
    const { io, stdout } = capture(parent);
    const status = await runCli(argv('import', tree, '--vault', vault, '--json'), io);
    expect(status).toBe(EXIT_CODES.usage);
    const body = JSON.parse(stdout()) as Envelope;
    expect(body.ok).toBe(false);
    expect(body.error?.code).toBe('E_PATH_OUTSIDE_VAULT');
  });
});

it('rejects non-markdown single-file imports', async () => {
  await withTemp(async (parent) => {
    const vault = await makeVault(parent);
    const file = join(parent, 'notes.txt');
    await writeFile(file, 'plain');
    const { io, stdout } = capture(parent);
    const status = await runCli(argv('import', file, '--vault', vault, '--json'), io);
    expect(status).toBe(EXIT_CODES.usage);
    const body = JSON.parse(stdout()) as Envelope;
    expect(body.error?.code).toBe('E_ARG_INVALID');
  });
});
