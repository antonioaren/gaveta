import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import {
  EXIT_CODES,
  GAVETA_DIRECTORY,
  GAVETA_VAULT_ENV,
  createDefaultVaultConfig,
  readVaultText,
  writeVaultConfig,
} from '@gaveta/core';
import { describe, expect, it } from 'vitest';
import { runCli, type CliIo } from '../run.ts';

const HASH = `sha256:${'ab'.repeat(32)}`;

interface Envelope {
  ok: boolean;
  command: string;
  error?: {
    code: string;
    details?: { candidates?: unknown[]; problem?: string };
  };
  warnings?: { code: string }[];
}

async function withTemp(run: (directory: string) => Promise<void>): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), 'gaveta-cli-notes-sec-'));
  try {
    await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function makeVault(parent: string, strict = false): Promise<string> {
  const root = join(parent, 'vault');
  await mkdir(join(root, GAVETA_DIRECTORY), { recursive: true });
  const config = createDefaultVaultConfig();
  config.rel.strict = strict;
  await writeVaultConfig(root, config);
  return root;
}

function capture(
  cwd: string,
  stdin?: string,
  env: NodeJS.ProcessEnv = {},
): { io: CliIo; stdout: () => string; stderr: () => string } {
  let out = '';
  let err = '';
  return {
    io: {
      cwd,
      env,
      ...(stdin === undefined ? {} : { stdin: Readable.from([stdin]) }),
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

async function tree(root: string): Promise<readonly string[]> {
  return readdir(root, { recursive: true });
}

describe('new and edit safety', () => {
  it('refuses a folder outside the vault and a symlink that leaves it', async () => {
    await withTemp(async (parent) => {
      const root = await makeVault(parent);
      const outside = join(parent, 'fuera');
      await mkdir(outside);
      await writeFile(join(outside, 'secreto.txt'), 'secreto');
      const escaped = capture(root);
      expect(
        await runCli(
          argv('new', 'Fuera', '--type', 'doc', '--in', '../fuera', '--json'),
          escaped.io,
        ),
      ).toBe(EXIT_CODES.usage);
      const body = JSON.parse(escaped.stdout()) as Envelope;
      expect(body.error?.code).toBe('E_PATH_OUTSIDE_VAULT');
      expect(escaped.stderr()).toBe('');

      const encoded = capture(root);
      expect(
        await runCli(
          argv('new', 'Fuera', '--type', 'doc', '--in', '%2e%2e/fuera', '--json'),
          encoded.io,
        ),
      ).toBe(EXIT_CODES.usage);
      expect((JSON.parse(encoded.stdout()) as Envelope).error?.code).toBe('E_PATH_OUTSIDE_VAULT');

      await symlink(outside, join(root, 'escape'), 'dir');
      const linked = capture(root);
      expect(
        await runCli(argv('new', 'Fuga', '--type', 'doc', '--in', 'escape', '--json'), linked.io),
      ).toBe(EXIT_CODES.usage);
      expect((JSON.parse(linked.stdout()) as Envelope).error?.code).toBe('E_PATH_OUTSIDE_VAULT');
      expect(await readFile(join(outside, 'secreto.txt'), 'utf8')).toBe('secreto');
      expect(await readdir(outside)).toEqual(['secreto.txt']);
      expect((await tree(root)).some((name) => name.endsWith('.html'))).toBe(false);
    });
  });

  it('strips hostile HTML and does not write a conflict', async () => {
    await withTemp(async (parent) => {
      const root = await makeVault(parent);
      const hostile = [
        '<article><h1>Hostil</h1><script>alert(1)</script>',
        '<p onclick="evil()">texto seguro</p>',
        '<a href="javascript:alert(1)">pulsa</a></article>',
      ].join('');
      const created = capture(root, hostile);
      expect(
        await runCli(argv('new', 'Hostil', '--type', 'doc', '--from', '-', '--json'), created.io),
      ).toBe(EXIT_CODES.ok);
      const html = await readVaultText(root, 'hostil.html');
      expect(html.includes('<script')).toBe(false);
      expect(html.includes('onclick')).toBe(false);
      expect(html.includes('javascript:')).toBe(false);
      expect(html.includes('texto seguro')).toBe(true);
      expect(
        (JSON.parse(created.stdout()) as Envelope).warnings?.some(
          (warning) => warning.code === 'W_UNSAFE_REMOVED',
        ),
      ).toBe(true);

      const current = await readVaultText(root, 'hostil.html');
      await writeFile(join(root, 'hostil.html'), current.replace('texto seguro', 'cambiado'));
      const conflict = capture(root, '<p>otro</p>');
      expect(
        await runCli(
          argv('edit', 'Hostil', '--replace', '--if-match', HASH, '--from', '-', '--json'),
          conflict.io,
        ),
      ).toBe(EXIT_CODES.conflict);
      expect((JSON.parse(conflict.stdout()) as Envelope).error?.code).toBe('E_CONFLICT');
      expect(await readVaultText(root, 'hostil.html')).toBe(
        current.replace('texto seguro', 'cambiado'),
      );
      expect((await tree(root)).some((name) => name.includes('.tmp'))).toBe(false);
    });
  });

  it('returns candidates for an ambiguous title and writes from GAVETA_VAULT only', async () => {
    await withTemp(async (parent) => {
      const root = await makeVault(parent);
      await runCli(argv('new', 'Duplicada', '--type', 'doc', '--in', 'a'), capture(root).io);
      await runCli(argv('new', 'Duplicada', '--type', 'doc', '--in', 'b'), capture(root).io);
      const ambiguous = capture(root, '<article><h1>Origen</h1><p>[[Duplicada]]</p></article>');
      expect(
        await runCli(argv('new', 'Origen', '--type', 'doc', '--from', '-', '--json'), ambiguous.io),
      ).toBe(EXIT_CODES.notFound);
      const body = JSON.parse(ambiguous.stdout()) as Envelope;
      expect(body.error?.code).toBe('E_REF_AMBIGUOUS');
      expect(body.error?.details?.candidates).toHaveLength(2);
      expect((await tree(root)).some((name) => name.endsWith('origen.html'))).toBe(false);

      const elsewhere = join(parent, 'elsewhere');
      await mkdir(elsewhere);
      const fromEnv = capture(elsewhere, undefined, { [GAVETA_VAULT_ENV]: root });
      expect(await runCli(argv('new', 'Desde env', '--type', 'doc'), fromEnv.io)).toBe(
        EXIT_CODES.ok,
      );
      expect(await readVaultText(root, 'desde-env.html')).toContain('Desde env');
      expect(await readdir(elsewhere)).toEqual([]);
    });
  });

  it('does not write a strict unknown rel', async () => {
    await withTemp(async (parent) => {
      const root = await makeVault(parent, true);
      const created = capture(
        root,
        '<article><h1>Rel</h1><p><a href="https://example.com" rel="sponsored">Example</a></p></article>',
      );
      expect(
        await runCli(argv('new', 'Rel', '--type', 'doc', '--from', '-', '--json'), created.io),
      ).toBe(EXIT_CODES.validation);
      expect(created.stderr()).toBe('');
      const body = JSON.parse(created.stdout()) as Envelope;
      expect(body.ok).toBe(false);
      expect(body.error?.code).toBe('W_REL_UNKNOWN');
      expect((await tree(root)).some((name) => name.endsWith('.html'))).toBe(false);
    });
  });

  it('rejects a ref that leaves the vault', async () => {
    await withTemp(async (parent) => {
      const root = await makeVault(parent);
      await writeFile(join(parent, 'secreto.html'), 'no leer');
      await runCli(argv('new', 'Dentro', '--type', 'doc'), capture(root).io);
      const escaped = capture(root);
      expect(await runCli(argv('read', '../secreto.html', '--json'), escaped.io)).toBe(
        EXIT_CODES.usage,
      );
      expect((JSON.parse(escaped.stdout()) as Envelope).error?.code).toBe('E_PATH_OUTSIDE_VAULT');
      const script = capture(root);
      expect(await runCli(argv('read', 'javascript:alert(1)', '--json'), script.io)).toBe(
        EXIT_CODES.validation,
      );
      expect((JSON.parse(script.stdout()) as Envelope).error?.code).toBe('E_UNSAFE_URL');
      expect(await readFile(join(parent, 'secreto.html'), 'utf8')).toBe('no leer');
    });
  });
});
