import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  GAVETA_DIRECTORY,
  GavetaRefError,
  createDefaultVaultConfig,
  createNote,
  editNote,
  readNote,
  readVaultText,
  writeVaultConfig,
} from './index.ts';

const NOW = '2026-10-22T12:00:00.000Z';
const ID_A = '01JB7Z3K9QX4T5M2N8V6R0WYHC';
const ID_B = '01JB8A2M4R7C9D1E3F5G7H9J0K';
const ID_C = '01JB9C3N5S8D0E2F4G6H8J1K2M';
const HASH = `sha256:${'cd'.repeat(32)}`;

const HOSTILE = [
  '<article><h1>Hostil</h1>',
  '<script>alert(1)</script>',
  '<p onclick="evil()">texto seguro</p>',
  '<a href="javascript:alert(1)">pulsa</a>',
  '<img src="https://evil.example/a.png" alt="remota">',
  '</article>',
].join('');

async function withTemp(run: (directory: string) => Promise<void>): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), 'gaveta-notes-sec-'));
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

async function expectCode(run: () => Promise<unknown>, code: string): Promise<unknown> {
  try {
    await run();
  } catch (error) {
    expect(error).toMatchObject({ code });
    return error;
  }
  throw new Error(`expected ${code}`);
}

async function tree(root: string): Promise<readonly string[]> {
  return readdir(root, { recursive: true });
}

function assertClean(html: string): void {
  expect(html.includes('<script')).toBe(false);
  expect(html.includes('onclick')).toBe(false);
  expect(html.includes('javascript:')).toBe(false);
  expect(html.includes('https://evil.example')).toBe(false);
  expect(html.includes('texto seguro')).toBe(true);
}

describe('note path safety', () => {
  it('rejects a folder that leaves the vault and does not create it', async () => {
    await withTemp(async (parent) => {
      const root = await makeVault(parent);
      const outside = join(parent, 'fuera');
      await mkdir(outside);
      await writeFile(join(outside, 'secreto.txt'), 'secreto');
      for (const folder of ['../fuera', '%2e%2e/fuera', '../fuera/mas']) {
        await expectCode(
          () =>
            createNote({
              vaultRoot: root,
              title: 'Fuera',
              type: 'doc',
              folder,
              now: NOW,
              id: ID_A,
            }),
          'E_PATH_OUTSIDE_VAULT',
        );
      }
      await expectCode(
        () =>
          createNote({
            vaultRoot: root,
            title: 'Url',
            type: 'doc',
            folder: 'javascript:alert(1)',
            now: NOW,
            id: ID_A,
          }),
        'E_UNSAFE_URL',
      );
      expect(await readFile(join(outside, 'secreto.txt'), 'utf8')).toBe('secreto');
      expect(await readdir(outside)).toEqual(['secreto.txt']);
      expect((await tree(root)).some((name) => name.endsWith('.html'))).toBe(false);
    });
  });

  it('rejects a symlink folder that points outside the vault', async () => {
    await withTemp(async (parent) => {
      const root = await makeVault(parent);
      const outside = join(parent, 'fuera');
      await mkdir(outside);
      await symlink(outside, join(root, 'escape'), 'dir');
      await expectCode(
        () =>
          createNote({
            vaultRoot: root,
            title: 'Fuga',
            type: 'doc',
            folder: 'escape',
            now: NOW,
            id: ID_A,
          }),
        'E_PATH_OUTSIDE_VAULT',
      );
      expect(await readdir(outside)).toEqual([]);
    });
  });

  it('rejects a ref that escapes the vault', async () => {
    await withTemp(async (parent) => {
      const root = await makeVault(parent);
      const outside = join(parent, 'secreto.html');
      await writeFile(outside, 'no leer');
      await createNote({ vaultRoot: root, title: 'Dentro', type: 'doc', now: NOW, id: ID_A });
      await expectCode(
        () => readNote({ vaultRoot: root, ref: '../secreto.html', as: 'html' }),
        'E_PATH_OUTSIDE_VAULT',
      );
      await expectCode(
        () => readNote({ vaultRoot: root, ref: 'javascript:alert(1)', as: 'text' }),
        'E_UNSAFE_URL',
      );
      expect(await readFile(outside, 'utf8')).toBe('no leer');
    });
  });
});

describe('note HTML safety', () => {
  it('strips hostile HTML on create and still writes a valid note', async () => {
    await withTemp(async (parent) => {
      const root = await makeVault(parent);
      const created = await createNote({
        vaultRoot: root,
        title: 'Hostil',
        type: 'doc',
        html: HOSTILE,
        now: NOW,
        id: ID_A,
      });
      expect(created.ok).toBe(true);
      if (!created.ok) {
        return;
      }
      const html = await readVaultText(root, created.path);
      assertClean(html);
      expect(created.warnings.some((warning) => warning.code === 'W_UNSAFE_REMOVED')).toBe(true);
      expect(created.warnings.some((warning) => warning.code === 'W_REMOTE_RESOURCE')).toBe(true);
    });
  });

  it('strips hostile HTML on edit and does not touch the rest of the file', async () => {
    await withTemp(async (parent) => {
      const root = await makeVault(parent);
      await createNote({
        vaultRoot: root,
        title: 'Limpia',
        type: 'doc',
        html: '<article><h1>Limpia</h1><section id="cuerpo"><p>original</p></section></article>',
        now: NOW,
        id: ID_A,
      });
      const before = await readVaultText(root, 'limpia.html');
      const open = '<section id="cuerpo">';
      const openEnd = before.indexOf(open) + open.length;
      const edited = await editNote({
        vaultRoot: root,
        ref: 'Limpia',
        section: 'cuerpo',
        mode: 'replace',
        html: '<p onclick="evil()">texto seguro</p><script>alert(1)</script><a href="javascript:alert(1)">pulsa</a>',
      });
      expect(edited.ok).toBe(true);
      const next = await readVaultText(root, 'limpia.html');
      expect(next.slice(0, openEnd)).toBe(before.slice(0, openEnd));
      assertClean(next);
    });
  });

  it('does not write an ambiguous wikilink', async () => {
    await withTemp(async (parent) => {
      const root = await makeVault(parent);
      await createNote({
        vaultRoot: root,
        title: 'Duplicada',
        type: 'doc',
        folder: 'a',
        now: NOW,
        id: ID_A,
      });
      await createNote({
        vaultRoot: root,
        title: 'Duplicada',
        type: 'doc',
        folder: 'b',
        now: NOW,
        id: ID_B,
      });
      const error = await expectCode(
        () =>
          createNote({
            vaultRoot: root,
            title: 'Origen',
            type: 'doc',
            html: '<article><h1>Origen</h1><p>[[Duplicada]]</p></article>',
            now: NOW,
            id: ID_C,
          }),
        'E_REF_AMBIGUOUS',
      );
      expect(error).toBeInstanceOf(GavetaRefError);
      if (!(error instanceof GavetaRefError)) {
        return;
      }
      const candidates = error.details.candidates;
      expect(Array.isArray(candidates)).toBe(true);
      if (!Array.isArray(candidates)) {
        return;
      }
      expect(candidates).toHaveLength(2);
      expect((await tree(root)).some((name) => name.endsWith('origen.html'))).toBe(false);
    });
  });
});

describe('note write conflicts', () => {
  it('returns E_CONFLICT and leaves an external edit in place', async () => {
    await withTemp(async (parent) => {
      const root = await makeVault(parent);
      const created = await createNote({
        vaultRoot: root,
        title: 'Conflicto',
        type: 'doc',
        html: '<article><h1>Conflicto</h1><section id="cuerpo"><p>uno</p></section></article>',
        now: NOW,
        id: ID_A,
      });
      expect(created.ok).toBe(true);
      if (!created.ok) {
        return;
      }
      const original = await readVaultText(root, created.path);
      const modified = original.replace('uno', 'dos');
      await writeFile(join(root, created.path), modified);
      await expectCode(
        () =>
          editNote({
            vaultRoot: root,
            ref: 'Conflicto',
            section: 'cuerpo',
            mode: 'replace',
            html: '<p>tres</p>',
            ifMatch: created.hash,
          }),
        'E_CONFLICT',
      );
      expect(await readVaultText(root, created.path)).toBe(modified);
      expect((await tree(root)).some((name) => name.includes('.tmp'))).toBe(false);
      expect(modified.includes('tres')).toBe(false);
    });
  });

  it('does not create a note when --if-match is present', async () => {
    await withTemp(async (parent) => {
      const root = await makeVault(parent);
      await expectCode(
        () =>
          createNote({
            vaultRoot: root,
            title: 'Nueva',
            type: 'doc',
            ifMatch: HASH,
            now: NOW,
            id: ID_A,
          }),
        'E_CONFLICT',
      );
      expect((await tree(root)).filter((name) => name.endsWith('.html'))).toEqual([]);
      expect((await tree(root)).some((name) => name.includes('.tmp'))).toBe(false);
    });
  });
});
