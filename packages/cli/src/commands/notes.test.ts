import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import {
  EXIT_CODES,
  GAVETA_DIRECTORY,
  createDefaultVaultConfig,
  noteContentHash,
  readVaultText,
  writeVaultConfig,
} from '@gaveta/core';
import { describe, expect, it } from 'vitest';
import { runCli, type CliIo } from '../run.ts';

interface Envelope {
  ok: boolean;
  schemaVersion: number;
  command: string;
  data: {
    id?: string;
    path?: string;
    hash?: string;
    title?: string;
    type?: string;
    as?: string;
    text?: string;
    html?: string;
    section?: string | null;
    links?: { pending: { title: string }[]; resolved: { path: string | null }[] };
    outline?: { sections: { id: string | null }[]; tasks: unknown[]; links: unknown[] };
  } | null;
  warnings: { code: string; message: string; hint: string }[];
  error?: {
    code: string;
    message: string;
    hint: string;
    details?: { problem?: string; candidates?: { id: string; title: string; path: string }[] };
  };
}

async function withTemp(run: (directory: string) => Promise<void>): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), 'gaveta-cli-notes-'));
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

function parseEnvelope(stdout: string): Envelope {
  return JSON.parse(stdout) as Envelope;
}

describe('new, read and edit', () => {
  it('creates two linked notes, reads one, and edits a section', async () => {
    await withTemp(async (parent) => {
      const root = await makeVault(parent);
      const other = capture(root, '<article><h1>Other</h1><p>El motor usa sqlite.</p></article>');
      expect(await runCli(argv('new', 'Other', '--type', 'doc', '--from', '-'), other.io)).toBe(
        EXIT_CODES.ok,
      );
      expect(other.stderr()).toBe('');
      expect(other.stdout()).toContain('Creada other.html\n');

      const origin = capture(
        root,
        '<article><h1>Origen</h1><section id="cuerpo"><p>Ver [[Other]]</p></section></article>',
      );
      expect(
        await runCli(
          argv('new', 'Origen', '--type', 'doc', '--tags', 'indice, sql', '--from', '-', '--json'),
          origin.io,
        ),
      ).toBe(EXIT_CODES.ok);
      expect(origin.stderr()).toBe('');
      const created = parseEnvelope(origin.stdout());
      expect(created).toMatchObject({
        ok: true,
        schemaVersion: 1,
        command: 'new',
        data: { path: 'origen.html', title: 'Origen', type: 'doc' },
      });
      expect(created.data?.links?.resolved.some((link) => link.path === 'other.html')).toBe(true);
      expect(created.data?.hash?.startsWith('sha256:')).toBe(true);

      const hyphenTitle = capture(root);
      expect(
        await runCli(argv('new', '--type', 'doc', '--json', '--', '-evil'), hyphenTitle.io),
      ).toBe(EXIT_CODES.ok);
      const hyphenCreated = parseEnvelope(hyphenTitle.stdout());
      expect(hyphenCreated.data?.title).toBe('-evil');
      expect(hyphenCreated.data?.path).toBe('evil.html');
      const file = await readVaultText(root, 'origen.html');
      expect(file.includes('data-g-to=')).toBe(true);
      expect(file.includes('[[Other]]')).toBe(false);
      expect(file.includes('indice, sql')).toBe(true);

      const readHuman = capture(root);
      expect(await runCli(argv('read', 'Origen', '--as', 'text'), readHuman.io)).toBe(
        EXIT_CODES.ok,
      );
      expect(readHuman.stdout()).toContain('Other');
      expect(readHuman.stdout()).toContain(noteContentHash(file));
      expect(readHuman.stderr()).toBe('');

      const outline = capture(root);
      expect(
        await runCli(argv('read', 'origen.html', '--as', 'outline', '--json'), outline.io),
      ).toBe(EXIT_CODES.ok);
      expect(outline.stderr()).toBe('');
      const outlined = parseEnvelope(outline.stdout());
      expect(outlined.data?.as).toBe('outline');
      expect(outlined.data?.outline?.sections.some((section) => section.id === 'cuerpo')).toBe(
        true,
      );
      expect(outlined.data?.hash).toBe(noteContentHash(file));

      const edited = capture(root, '<p>Añadido sqlite.</p>');
      expect(
        await runCli(
          argv('edit', 'Origen', '--section', 'cuerpo', '--append', '--from', '-', '--json'),
          edited.io,
        ),
      ).toBe(EXIT_CODES.ok);
      const editBody = parseEnvelope(edited.stdout());
      expect(editBody.command).toBe('edit');
      expect(editBody.data?.section).toBe('cuerpo');
      expect(editBody.data?.path).toBe('origen.html');
      const after = await readVaultText(root, 'origen.html');
      expect(after.startsWith(file.slice(0, file.indexOf('</section>')))).toBe(true);
      expect(after.includes('Añadido sqlite.')).toBe(true);

      const humanEdit = capture(root, '<p>otra</p>');
      expect(
        await runCli(
          argv('edit', 'Origen', '--section', 'cuerpo', '--prepend', '--from', '-'),
          humanEdit.io,
        ),
      ).toBe(EXIT_CODES.ok);
      expect(humanEdit.stdout()).toContain('Actualizada origen.html\n');
      expect(humanEdit.stderr()).toBe('');
    });
  });

  it('snapshots stable error envelopes for each command', async () => {
    await withTemp(async (parent) => {
      const root = await makeVault(parent);
      const badType = capture(root);
      expect(await runCli(argv('new', 'Nota', '--type', 'pagina', '--json'), badType.io)).toBe(
        EXIT_CODES.usage,
      );
      expect(badType.stderr()).toBe('');
      expect(badType.stdout()).toMatchSnapshot();

      const missing = capture(root);
      expect(await runCli(argv('read', 'Nadie', '--json'), missing.io)).toBe(EXIT_CODES.notFound);
      expect(missing.stdout()).toMatchSnapshot();

      await runCli(
        argv('new', 'Nota', '--type', 'doc', '--from', '-'),
        capture(root, '<article><h1>Nota</h1><section id="cuerpo"><p>uno</p></section></article>')
          .io,
      );
      const hash = noteContentHash(await readVaultText(root, 'nota.html'));
      await writeFile(join(root, 'nota.html'), await readFile(join(root, 'nota.html'), 'utf8'));
      const conflict = capture(root, '<p>dos</p>');
      const stale = `sha256:${'ab'.repeat(32)}`;
      expect(stale).not.toBe(hash);
      expect(
        await runCli(
          argv(
            'edit',
            'Nota',
            '--section',
            'cuerpo',
            '--replace',
            '--if-match',
            stale,
            '--from',
            '-',
            '--json',
          ),
          conflict.io,
        ),
      ).toBe(EXIT_CODES.conflict);
      expect(conflict.stderr()).toBe('');
      expect(conflict.stdout()).toMatchSnapshot();
    });
  });
});
