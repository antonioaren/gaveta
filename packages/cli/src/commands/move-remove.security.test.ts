import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NOTE_X, vaultPath } from '@gaveta/fixtures';
import {
  EXIT_CODES,
  GAVETA_DIRECTORY,
  createDefaultVaultConfig,
  readVaultText,
  writeVaultConfig,
} from '@gaveta/core';
import { describe, expect, it } from 'vitest';
import { runCli, type CliIo } from '../run.ts';

interface Envelope {
  ok: boolean;
  error?: { code: string };
}

async function withBacklinks(run: (root: string) => Promise<void>): Promise<void> {
  const parent = await mkdtemp(join(tmpdir(), 'gaveta-cli-mv-sec-'));
  try {
    const root = join(parent, 'backlinks');
    await cp(vaultPath('backlinks'), root, { recursive: true });
    await run(root);
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
}

async function makeVault(parent: string): Promise<string> {
  const root = join(parent, 'vault');
  await mkdir(join(root, GAVETA_DIRECTORY), { recursive: true });
  const config = createDefaultVaultConfig();
  await writeVaultConfig(root, config);
  return root;
}

function capture(cwd: string): { io: CliIo; stdout: () => string } {
  let out = '';
  return {
    io: {
      cwd,
      stdout(chunk: string) {
        out += chunk;
      },
    },
    stdout: () => out,
  };
}

function argv(...args: string[]): string[] {
  return ['node', 'gaveta', ...args];
}

describe('mv and rm safety', () => {
  it('refuses destinations outside the vault, symlink escapes, and overwrites', async () => {
    await withBacklinks(async (root) => {
      const outside = join(root, '..', 'fuera');
      await mkdir(outside);
      await writeFile(join(outside, 'secreto.txt'), 'secreto');

      const escaped = capture(root);
      expect(await runCli(argv('mv', 'Nota X', '../fuera/x.html', '--json'), escaped.io)).toBe(
        EXIT_CODES.usage,
      );
      expect((JSON.parse(escaped.stdout()) as Envelope).error?.code).toBe('E_PATH_OUTSIDE_VAULT');
      expect(await readVaultText(root, NOTE_X.path)).toContain(NOTE_X.title);

      await symlink(outside, join(root, 'escape'), 'dir');
      const linked = capture(root);
      expect(await runCli(argv('mv', 'Nota X', 'escape/nueva.html', '--json'), linked.io)).toBe(
        EXIT_CODES.usage,
      );
      expect((JSON.parse(linked.stdout()) as Envelope).error?.code).toBe('E_PATH_OUTSIDE_VAULT');

      const occupied = capture(root);
      expect(await runCli(argv('mv', 'Nota X', 'destino-enlace.html', '--json'), occupied.io)).toBe(
        EXIT_CODES.usage,
      );
      expect((JSON.parse(occupied.stdout()) as Envelope).error?.code).toBe('E_PATH_EXISTS');
    });
  });

  it('refuses rm on a ref that leaves the vault', async () => {
    await withBacklinks(async (root) => {
      const parent = join(root, '..');
      await writeFile(join(parent, 'secreto.html'), 'no borrar');
      const escaped = capture(root);
      expect(await runCli(argv('rm', '../secreto.html', '--json'), escaped.io)).toBe(
        EXIT_CODES.usage,
      );
      expect((JSON.parse(escaped.stdout()) as Envelope).error?.code).toBe('E_PATH_OUTSIDE_VAULT');
      expect(await readFile(join(parent, 'secreto.html'), 'utf8')).toBe('no borrar');
    });
  });

  it('does not delete a note linked from outside the vault path', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'gaveta-cli-rm-sec-'));
    try {
      const root = await makeVault(parent);
      await runCli(argv('new', 'Sola', '--type', 'doc'), capture(root).io);
      const removed = capture(root);
      expect(await runCli(argv('rm', 'Sola', '--json'), removed.io)).toBe(EXIT_CODES.ok);
      expect((JSON.parse(removed.stdout()) as Envelope).ok).toBe(true);
    } finally {
      await rm(parent, { recursive: true, force: true });
    }
  });
});
