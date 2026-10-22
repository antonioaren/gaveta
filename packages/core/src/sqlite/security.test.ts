import './warning.ts';
import { mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { expect, it } from 'vitest';
import { GavetaError, openVaultIndex, type VaultIndex } from '../index.ts';

const NOTE_A = '01JB7Z3K9QX4T5M2N8V6R0WYHC';
const NOTE_B = '01JB8A2M4R7C9D1E3F5G7H9J0K';
const PAYLOAD = `'); DROP TABLE notes;--`;

function noteHtml(title: string, id: string, body: string): string {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${title}</title><meta name="gaveta:id" content="${id}"><meta name="gaveta:type" content="doc"><meta name="gaveta:created" content="2026-10-22T10:00:00Z"></head><body><article><h1>${title}</h1><p>${body}</p></article></body></html>`;
}

async function withTemp(run: (directory: string) => Promise<void>): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), 'gaveta-index-sec-'));
  try {
    await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function makeVault(parent: string): Promise<string> {
  const root = join(parent, 'vault');
  await mkdir(join(root, '.gaveta'), { recursive: true });
  return root;
}

async function writeNote(root: string, relativePath: string, html: string): Promise<void> {
  const absolute = join(root, ...relativePath.split('/'));
  await mkdir(dirname(absolute), { recursive: true });
  await writeFile(absolute, html);
}

async function withIndex(root: string, run: (index: VaultIndex) => Promise<void>): Promise<void> {
  const index = await openVaultIndex(root);
  try {
    await run(index);
  } finally {
    index.close();
  }
}

it('stores injected SQL as text and does not execute it', async () => {
  await withTemp(async (parent) => {
    const root = await makeVault(parent);
    await writeNote(root, 'a.html', noteHtml(PAYLOAD, NOTE_A, `sqlite'; DELETE FROM notes; --`));
    await withIndex(root, async (index) => {
      expect((await index.rebuild()).written).toBe(1);
      expect(index.note('a.html')?.title).toBe(PAYLOAD);
      expect(index.search('sqlite')).toHaveLength(1);
      expect(() => index.search(`${PAYLOAD}; DROP TABLE notes;`)).toThrow(GavetaError);
      expect(index.notes()).toHaveLength(1);
      expect(index.note('a.html')?.title).toBe(PAYLOAD);
    });
  });
});

it('rejects note paths that leave the vault and does not read the outside file', async () => {
  await withTemp(async (parent) => {
    const root = await makeVault(parent);
    const secret = join(parent, 'secret.html');
    await writeFile(secret, noteHtml('Secreto', NOTE_B, 'TOP-SECRET'));
    await writeNote(root, 'a.html', noteHtml('Alfa', NOTE_A, 'visible'));
    await withIndex(root, async (index) => {
      await index.rebuild();
      await expect(index.upsert('../secret.html')).rejects.toMatchObject({
        code: 'E_PATH_OUTSIDE_VAULT',
      });
      await expect(index.upsert('notes/../../secret.html')).rejects.toMatchObject({
        code: 'E_PATH_OUTSIDE_VAULT',
      });
      await expect(index.upsert(secret)).rejects.toMatchObject({ code: 'E_PATH_OUTSIDE_VAULT' });
      await expect(index.remove('../secret.html')).rejects.toMatchObject({
        code: 'E_PATH_OUTSIDE_VAULT',
      });
      await expect(index.upsert('a.html\0.html')).rejects.toMatchObject({
        code: 'E_PATH_OUTSIDE_VAULT',
      });
      await expect(index.upsert('.gaveta/index.sqlite')).rejects.toMatchObject({
        code: 'E_ARG_INVALID',
      });
      expect(index.notes().map((note) => note.path)).toEqual(['a.html']);
      expect(JSON.stringify(index.notes())).not.toContain('TOP-SECRET');
    });
    expect(await readFile(secret, 'utf8')).toContain('TOP-SECRET');
  });
});

it('does not follow a symlink that leaves the vault', async () => {
  await withTemp(async (parent) => {
    const root = await makeVault(parent);
    const secret = join(parent, 'secret.html');
    await writeFile(secret, 'TOP-SECRET');
    await symlink(secret, join(root, 'leak.html'));
    await symlink(parent, join(root, 'escape'));
    await writeFile(join(parent, 'outside.html'), noteHtml('Fuera', NOTE_B, 'TOP-SECRET'));
    await writeNote(root, 'a.html', noteHtml('Alfa', NOTE_A, 'visible sqlite'));
    await withIndex(root, async (index) => {
      const report = await index.rebuild();
      expect(index.note('leak.html')).toBeNull();
      expect(index.notes().map((note) => note.path)).toEqual(['a.html']);
      expect(report.problems.some((problem) => problem.path === 'leak.html')).toBe(true);
      expect(report.problems.some((problem) => problem.path === 'escape')).toBe(true);
      expect(JSON.stringify(index.notes())).not.toContain('TOP-SECRET');
      expect(index.search('secret')).toEqual([]);
      expect(index.search('visible')).toHaveLength(1);
    });
  });
});

it('refuses to place the index through a symlink', async () => {
  await withTemp(async (parent) => {
    const root = await makeVault(parent);
    const outside = join(parent, 'outside');
    await mkdir(outside);
    await rm(join(root, '.gaveta'), { recursive: true });
    await symlink(outside, join(root, '.gaveta'));
    await expect(openVaultIndex(root)).rejects.toMatchObject({ code: 'E_PATH_OUTSIDE_VAULT' });
    expect(existsSync(join(outside, 'index.sqlite'))).toBe(false);

    await rm(join(root, '.gaveta'));
    await mkdir(join(root, '.gaveta'));
    const outsideDb = join(parent, 'outside.sqlite');
    await writeFile(outsideDb, 'keep');
    await symlink(outsideDb, join(root, '.gaveta', 'index.sqlite'));
    await expect(openVaultIndex(root)).rejects.toMatchObject({ code: 'E_PATH_OUTSIDE_VAULT' });
    expect(await readFile(outsideDb, 'utf8')).toBe('keep');
  });
});

it('does not index HTML stored inside .gaveta', async () => {
  await withTemp(async (parent) => {
    const root = await makeVault(parent);
    await writeFile(
      join(root, '.gaveta', 'oculto.html'),
      noteHtml('Oculto', NOTE_B, 'TOP-SECRET sqlite'),
    );
    await writeNote(root, 'a.html', noteHtml('Alfa', NOTE_A, 'visible'));
    await withIndex(root, async (index) => {
      await index.rebuild();
      expect(index.notes().map((note) => note.path)).toEqual(['a.html']);
      expect(index.search('secret')).toEqual([]);
      expect(index.location).toBe(join(await realpath(root), '.gaveta', 'index.sqlite'));
    });
  });
});
