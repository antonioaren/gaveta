import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  EXIT_CODES,
  GAVETA_DIRECTORY,
  createDefaultVaultConfig,
  writeVaultConfig,
} from '@gaveta/core';
import { expect, it } from 'vitest';
import { runCli, type CliIo } from '../run.ts';

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

it('rejects a ref that leaves the vault and does not read outside files', async () => {
  await withTemp(async (parent) => {
    const root = await makeVault(parent);
    await writeFile(join(parent, 'secreto.html'), 'no leer', 'utf8');
    const escaped = capture(root);
    expect(await runCli(argv('validate', '../secreto.html', '--json'), escaped.io)).toBe(
      EXIT_CODES.usage,
    );
    expect((JSON.parse(escaped.stdout()) as { error?: { code: string } }).error?.code).toBe(
      'E_PATH_OUTSIDE_VAULT',
    );
    expect(await readFile(join(parent, 'secreto.html'), 'utf8')).toBe('no leer');
  });
});

const REPO_ROOT = join(fileURLToPath(import.meta.url), '../../../../..');

it('validates the malicious vault without leaving the vault', async () => {
  await withTemp(async (parent) => {
    const root = join(parent, 'malicious');
    await cp(join(REPO_ROOT, 'fixtures/vaults/malicious'), root, { recursive: true });
    const captured = capture(root);
    expect(await runCli(argv('validate', '--json'), captured.io)).toBe(EXIT_CODES.validation);
    expect(captured.stdout()).toContain('E_UNSAFE_SCRIPT');
  });
});

async function withTemp(run: (directory: string) => Promise<void>): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), 'gaveta-validate-sec-'));
  try {
    await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function makeVault(parent: string): Promise<string> {
  const root = join(parent, 'vault');
  const { mkdir } = await import('node:fs/promises');
  await mkdir(join(root, GAVETA_DIRECTORY), { recursive: true });
  await writeVaultConfig(root, createDefaultVaultConfig());
  return root;
}
