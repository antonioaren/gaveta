import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { vaultPath } from '@gaveta/fixtures';
import { GavetaOperationError, moveFolder, openVaultIndex, removeFolder } from '../index.ts';
import { createVaultFolder } from './folder.ts';

async function withTemp(run: (directory: string) => Promise<void>): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), 'gaveta-folder-'));
  try {
    await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function withIndex(
  root: string,
  run: (index: Awaited<ReturnType<typeof openVaultIndex>>) => Promise<void>,
): Promise<void> {
  const index = await openVaultIndex(root);
  try {
    await index.rebuild();
    await run(index);
  } finally {
    index.close();
  }
}

describe('folder operations', () => {
  it('creates an empty folder path', async () => {
    await withTemp(async (parent) => {
      const root = join(parent, 'vault');
      await mkdir(join(root, '.gaveta'), { recursive: true });
      await createVaultFolder(root, 'nueva/carpeta');
      await expect(readFile(join(root, 'nueva/carpeta'), 'utf8')).rejects.toThrow();
    });
  });

  it('moves every note under a folder prefix', async () => {
    await withTemp(async (parent) => {
      const root = join(parent, 'vault');
      await cp(vaultPath('backlinks'), root, { recursive: true });
      await withIndex(root, async (index) => {
        const moved = await moveFolder(index, 'enlaces', 'renombrados');
        expect(moved.moved.length).toBeGreaterThan(10);
      });
      await expect(
        readFile(join(root, 'renombrados/enlace-01.html'), 'utf8'),
      ).resolves.toBeDefined();
      await expect(readFile(join(root, 'enlaces/enlace-01.html'), 'utf8')).rejects.toThrow();
    });
  });

  it('refuses folder delete when an external note links inside the folder', async () => {
    await withTemp(async (parent) => {
      const root = join(parent, 'vault');
      await mkdir(join(root, '.gaveta'), { recursive: true });
      await mkdir(join(root, 'carpeta'), { recursive: true });
      const targetId = '01JB8A2M4R7C9D1E3F5G7H9J0K';
      const sourceId = '01JB7Z3K9QX4T5M2N8V6R0WYHC';
      await writeFile(
        join(root, 'carpeta/dentro.html'),
        `<!doctype html><html><head><meta charset="utf-8"><title>Dentro</title><meta name="gaveta:id" content="${targetId}"><meta name="gaveta:type" content="doc"><meta name="gaveta:created" content="2026-10-22T10:00:00Z"></head><body><article><h1>Dentro</h1></article></body></html>`,
      );
      await writeFile(
        join(root, 'fuera.html'),
        `<!doctype html><html><head><meta charset="utf-8"><title>Fuera</title><meta name="gaveta:id" content="${sourceId}"><meta name="gaveta:type" content="doc"><meta name="gaveta:created" content="2026-10-22T10:00:00Z"></head><body><article><h1>Fuera</h1><p><a href="carpeta/dentro.html" data-g-to="${targetId}">Dentro</a></p></article></body></html>`,
      );
      await withIndex(root, async (index) => {
        await expect(removeFolder(index, 'carpeta')).rejects.toBeInstanceOf(GavetaOperationError);
      });
    });
  });

  it('removes an empty folder tree', async () => {
    await withTemp(async (parent) => {
      const root = join(parent, 'vault');
      await mkdir(join(root, '.gaveta'), { recursive: true });
      await createVaultFolder(root, 'temporal/hoja');
      await writeFile(
        join(root, 'temporal/hoja/borrar.html'),
        `<!doctype html><html><head><meta charset="utf-8"><title>Borrar</title><meta name="gaveta:id" content="01JB8A2M4R7C9D1E3F5G7H9J0K"><meta name="gaveta:type" content="doc"><meta name="gaveta:created" content="2026-10-22T10:00:00Z"></head><body><article><h1>Borrar</h1></article></body></html>`,
      );
      await withIndex(root, async (index) => {
        await removeFolder(index, 'temporal', { force: true });
      });
      await expect(readFile(join(root, 'temporal/hoja/borrar.html'), 'utf8')).rejects.toThrow();
    });
  });
});
