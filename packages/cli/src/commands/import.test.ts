import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  EXIT_CODES,
  GAVETA_DIRECTORY,
  createDefaultVaultConfig,
  writeVaultConfig,
} from '@gaveta/core';
import { markdownVaultPath } from '@gaveta/fixtures';
import { expect, it } from 'vitest';
import { runCli, type CliIo } from '../run.ts';
import { commands } from '../registry.ts';

interface ImportEnvelope {
  readonly ok: boolean;
  readonly data: {
    readonly ok: boolean;
    readonly dryRun: boolean;
    readonly summary: {
      readonly created: number;
      readonly failed: number;
      readonly attachments: number;
    };
    readonly notes: { readonly path: string; readonly id: string; readonly links: unknown[] }[];
    readonly failures: { readonly code: string }[];
  };
}

function capture(cwd: string): { io: CliIo; stdout: () => string; stderr: () => string } {
  let out = '';
  let err = '';
  return {
    io: {
      cwd,
      env: {},
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

async function withTemp(run: (directory: string) => Promise<void>): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), 'gaveta-import-cli-'));
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

it('is registered on the default command list', () => {
  expect(commands.map((command) => command.name)).toContain('import');
});

it('imports a single markdown file under --in with JSON output', async () => {
  await withTemp(async (parent) => {
    const vault = await makeVault(parent);
    const source = join(parent, 'solo.md');
    await writeFile(source, '# Una nota\n\nHola.\n');
    const { io, stdout } = capture(parent);
    const status = await runCli(
      argv('import', source, '--in', 'docs', '--vault', vault, '--json'),
      io,
    );
    expect(status).toBe(EXIT_CODES.ok);
    const body = JSON.parse(stdout()) as ImportEnvelope;
    expect(body.ok).toBe(true);
    expect(body.data.summary.created).toBe(1);
    expect(body.data.notes[0]?.path).toBe('docs/solo.html');
    expect(body.data.notes[0]?.id.length).toBeGreaterThan(0);
    const html = await readFile(join(vault, 'docs/solo.html'), 'utf8');
    expect(html).toContain('Una nota');
  });
});

it('returns validation exit code when import fails without throwing', async () => {
  await withTemp(async (parent) => {
    const vault = await makeVault(parent);
    const folder = join(parent, 'bad');
    await mkdir(join(folder, 'broken'), { recursive: true });
    await writeFile(join(folder, 'broken/invalid.md'), '---\ntitle: [oops\n---\n# X\n');
    const { io, stdout } = capture(parent);
    const status = await runCli(argv('import', folder, '--vault', vault, '--json'), io);
    expect(status).toBe(EXIT_CODES.validation);
    const body = JSON.parse(stdout()) as ImportEnvelope;
    expect(body.data.ok).toBe(false);
    expect(body.data.failures.some((failure) => failure.code === 'E_IMPORT_PARSE')).toBe(true);
  });
});

it('dry-run leaves the vault unchanged', async () => {
  await withTemp(async (parent) => {
    const vault = await makeVault(parent);
    const before = await readFile(join(vault, '.gaveta/config.json'), 'utf8');
    const { io, stdout } = capture(parent);
    const status = await runCli(
      argv('import', markdownVaultPath(), '--vault', vault, '--dry-run', '--json'),
      io,
    );
    expect(status).toBe(EXIT_CODES.ok);
    const body = JSON.parse(stdout()) as ImportEnvelope;
    expect(body.data.dryRun).toBe(true);
    expect(body.data.summary.created).toBeGreaterThan(40);
    const after = await readFile(join(vault, '.gaveta/config.json'), 'utf8');
    expect(after).toBe(before);
  });
});
