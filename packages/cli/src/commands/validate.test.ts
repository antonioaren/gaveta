import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';
import { VALIDATOR_CODES } from '@gaveta/fixtures';
import {
  EXIT_CODES,
  GAVETA_DIRECTORY,
  createDefaultVaultConfig,
  writeVaultConfig,
} from '@gaveta/core';
import { expect, it } from 'vitest';
import { runCli, type CliIo } from '../run.ts';
import { commands } from '../registry.ts';

interface Envelope {
  ok: boolean;
  data: {
    ok: boolean;
    files: { path: string | null; ok: boolean; diagnostics: { code: string }[] }[];
  };
  error?: { code: string; details?: { problem?: string } };
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
  const directory = await mkdtemp(join(tmpdir(), 'gaveta-validate-'));
  try {
    await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

const REPO_ROOT = join(fileURLToPath(import.meta.url), '../../../../..');

function fixtureVault(name: 'problems' | 'malicious' | 'empty'): string {
  return join(REPO_ROOT, 'fixtures/vaults', name);
}

async function makeVault(parent: string): Promise<string> {
  const root = join(parent, 'vault');
  await mkdir(join(root, GAVETA_DIRECTORY), { recursive: true });
  await writeVaultConfig(root, createDefaultVaultConfig());
  return root;
}

async function copyFixture(
  parent: string,
  name: 'problems' | 'malicious' | 'empty',
): Promise<string> {
  const root = join(parent, name);
  const { cp } = await import('node:fs/promises');
  await cp(fixtureVault(name), root, { recursive: true });
  return root;
}

it('is registered on the default command list', () => {
  expect(commands.map((command) => command.name)).toContain('validate');
});

it('validates stdin without writing', async () => {
  await withTemp(async (parent) => {
    const root = await makeVault(parent);
    const html = await readFile(join(fixtureVault('malicious'), 'script.html'), 'utf8');
    const captured = capture(root);
    const status = await runCli(argv('validate', '--from', '-', '--json'), {
      ...captured.io,
      stdin: asyncReadable(html),
    });
    expect(status).toBe(EXIT_CODES.validation);
    const body = JSON.parse(captured.stdout()) as Envelope;
    expect(body.data.ok).toBe(false);
    expect(body.data.files[0]?.diagnostics.some((item) => item.code === 'E_UNSAFE_SCRIPT')).toBe(
      true,
    );
  });
});

it('validates the whole vault by default and reports duplicate ids', async () => {
  await withTemp(async (parent) => {
    const root = await copyFixture(parent, 'problems');
    const captured = capture(root);
    expect(await runCli(argv('validate', '--json'), captured.io)).toBe(EXIT_CODES.validation);
    const body = JSON.parse(captured.stdout()) as Envelope;
    expect(body.data.ok).toBe(false);
    const codes = body.data.files.flatMap((file) => file.diagnostics.map((item) => item.code));
    expect(codes).toContain('E_TASK_INVALID');
    expect(codes).toContain('E_ID_DUPLICATE');
    expect(codes.filter((code) => code === 'E_ID_DUPLICATE').length).toBeGreaterThanOrEqual(2);
  });
});

it('validates one note by ref', async () => {
  await withTemp(async (parent) => {
    const root = await copyFixture(parent, 'problems');
    const captured = capture(root);
    expect(await runCli(argv('validate', 'nota-sana.html', '--json'), captured.io)).toBe(
      EXIT_CODES.ok,
    );
    const body = JSON.parse(captured.stdout()) as Envelope;
    expect(body.data.files).toMatchObject([{ path: 'nota-sana.html', ok: true, diagnostics: [] }]);
  });
});

it('reports every malicious fixture code through the CLI', async () => {
  await withTemp(async (parent) => {
    const root = await copyFixture(parent, 'malicious');
    const captured = capture(root);
    expect(await runCli(argv('validate', '--all', '--json'), captured.io)).toBe(
      EXIT_CODES.validation,
    );
    const body = JSON.parse(captured.stdout()) as Envelope;
    const codes = new Set(
      body.data.files.flatMap((file) => file.diagnostics.map((item) => item.code)),
    );
    for (const code of VALIDATOR_CODES) {
      expect(codes.has(code)).toBe(true);
    }
  });
});

it('rejects ref together with --all or stdin', async () => {
  await withTemp(async (parent) => {
    const root = await makeVault(parent);
    const both = capture(root);
    expect(await runCli(argv('validate', 'x', '--all', '--json'), both.io)).toBe(EXIT_CODES.usage);
    expect((JSON.parse(both.stdout()) as Envelope).error?.details?.problem).toContain('ambos');
    const stdin = capture(root);
    expect(
      await runCli(argv('validate', 'x', '--from', '-', '--json'), {
        ...stdin.io,
        stdin: asyncReadable('<html></html>'),
      }),
    ).toBe(EXIT_CODES.usage);
  });
});

function asyncReadable(text: string): Readable {
  return Readable.from([text]);
}
