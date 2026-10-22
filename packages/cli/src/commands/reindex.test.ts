import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import {
  EXIT_CODES,
  GAVETA_DIRECTORY,
  INDEX_RELATIVE_PATH,
  createDefaultVaultConfig,
  openVaultIndex,
  writeVaultConfig,
} from '@gaveta/core';
import { expect, it } from 'vitest';
import { runCli, type CliIo } from '../run.ts';
import { commands } from '../registry.ts';

const NOTE_A = '01JB7Z3K9QX4T5M2N8V6R0WYHC';
const NOTE_B = '01JB8A2M4R7C9D1E3F5G7H9J0K';

interface Envelope {
  data: {
    mode: string;
    written: number;
    removed: number;
    problemCount: number;
    duplicateCount: number;
  };
  warnings: { code: string }[];
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

function noteHtml(title: string, id: string, body: string): string {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${title}</title><meta name="gaveta:id" content="${id}"><meta name="gaveta:type" content="doc"><meta name="gaveta:created" content="2026-10-22T10:00:00Z"></head><body><article><h1>${title}</h1><p>${body}</p></article></body></html>`;
}

async function withTemp(run: (directory: string) => Promise<void>): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), 'gaveta-reindex-'));
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

async function writeNote(root: string, relativePath: string, html: string): Promise<void> {
  const absolute = join(root, ...relativePath.split('/'));
  await mkdir(dirname(absolute), { recursive: true });
  await writeFile(absolute, html);
}

it('is registered on the default command list', () => {
  expect(commands.map((command) => command.name)).toContain('reindex');
});

it('runs incremental reindex by default and full with --full', async () => {
  await withTemp(async (parent) => {
    const root = await makeVault(parent);
    await writeNote(root, 'a.html', noteHtml('Alfa', NOTE_A, 'alfa'));
    await writeNote(root, 'b.html', noteHtml('Beta', NOTE_B, 'beta'));
    const first = capture(root);
    expect(await runCli(argv('reindex', '--json'), first.io)).toBe(EXIT_CODES.ok);
    const initial = JSON.parse(first.stdout()) as Envelope;
    expect(initial.data.mode).toBe('incremental');
    expect(initial.data.written).toBe(2);

    const second = capture(root);
    expect(await runCli(argv('reindex', '--json'), second.io)).toBe(EXIT_CODES.ok);
    expect((JSON.parse(second.stdout()) as Envelope).data.written).toBe(0);

    await writeNote(root, 'a.html', noteHtml('Alfa nueva', NOTE_A, 'cambio'));
    const third = capture(root);
    expect(await runCli(argv('reindex', '--json'), third.io)).toBe(EXIT_CODES.ok);
    expect((JSON.parse(third.stdout()) as Envelope).data.written).toBe(1);

    const full = capture(root);
    expect(await runCli(argv('reindex', '--full', '--json'), full.io)).toBe(EXIT_CODES.ok);
    expect((JSON.parse(full.stdout()) as Envelope).data.mode).toBe('full');

    const index = await openVaultIndex(root);
    try {
      expect(index.note('a.html')?.title).toBe('Alfa nueva');
      expect(index.notes().length).toBe(2);
    } finally {
      index.close();
    }
  });
});

it('rebuilds after deleting the index file', async () => {
  await withTemp(async (parent) => {
    const root = await makeVault(parent);
    await writeNote(root, 'a.html', noteHtml('Alfa', NOTE_A, 'alfa'));
    const seeded = capture(root);
    await runCli(argv('reindex', '--json'), seeded.io);
    await writeFile(join(root, INDEX_RELATIVE_PATH), 'not a database', 'utf8');
    const again = capture(root);
    expect(await runCli(argv('reindex', '--json'), again.io)).toBe(EXIT_CODES.ok);
    const body = JSON.parse(again.stdout()) as Envelope;
    expect(body.data.written).toBeGreaterThan(0);
    expect(body.warnings.some((warning) => warning.code === 'W_INDEX_RECOVERED')).toBe(true);
  });
});
