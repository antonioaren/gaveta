import { chmod, mkdir, open, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, it, vi } from 'vitest';
import { writeAtomic } from './atomic.ts';
import { withTemp } from './fixture.ts';

it('replaces a file via rename so the inode changes and no temp file remains', async () => {
  await withTemp(async (directory) => {
    const file = join(directory, 'note.html');
    await writeFile(file, 'original');
    const before = await stat(file);

    await writeAtomic(file, 'cañón\ncompleto');

    const after = await stat(file);
    expect(after.ino).not.toBe(before.ino);
    expect(await readFile(file, 'utf8')).toBe('cañón\ncompleto');
    const names = await readdir(directory);
    expect(names.filter((name) => name.endsWith('.tmp'))).toEqual([]);
  });
});

it('creates a new file and leaves the bytes unchanged, including an empty file', async () => {
  await withTemp(async (directory) => {
    const file = join(directory, 'config.json');
    await writeAtomic(file, '');
    expect(await readFile(file, 'utf8')).toBe('');
    await writeAtomic(file, 'hola');
    expect(await readFile(file, 'utf8')).toBe('hola');
  });
});

it('leaves the original file intact when the directory is not writable', async () => {
  await withTemp(async (directory) => {
    const file = join(directory, 'note.html');
    await writeFile(file, 'original');
    await chmod(directory, 0o555);
    try {
      await expect(writeAtomic(file, 'truncated')).rejects.toThrow();
      expect(await readFile(file, 'utf8')).toBe('original');
    } finally {
      await chmod(directory, 0o755);
    }
    const names = await readdir(directory);
    expect(names.filter((name) => name.endsWith('.tmp'))).toEqual([]);
  });
});

it('removes the temp file when the rename cannot replace the destination', async () => {
  await withTemp(async (directory) => {
    const destination = join(directory, 'blocked');
    await mkdir(destination);
    await writeFile(join(destination, 'child.txt'), 'keep');

    await expect(writeAtomic(destination, 'nope')).rejects.toThrow();

    expect(await readFile(join(destination, 'child.txt'), 'utf8')).toBe('keep');
    const names = await readdir(directory);
    expect(names.filter((name) => name.endsWith('.tmp'))).toEqual([]);
  });
});

it('keeps the renamed file when directory fsync is not supported', async () => {
  await withTemp(async (directory) => {
    const probe = await open(directory, 'r');
    const prototype: { sync: () => Promise<void> } = Object.getPrototypeOf(probe) as {
      sync: () => Promise<void>;
    };
    await probe.close();
    let calls = 0;
    const original = prototype.sync;
    const spy = vi.spyOn(prototype, 'sync').mockImplementation(async function (this: {
      sync: () => Promise<void>;
    }) {
      calls += 1;
      if (calls > 1) {
        throw Object.assign(new Error('directory sync'), { code: 'EINVAL' });
      }
      return original.call(this);
    });
    try {
      const file = join(directory, 'note.html');
      await writeAtomic(file, 'durable');
      expect(await readFile(file, 'utf8')).toBe('durable');
      expect(calls).toBeGreaterThan(1);
    } finally {
      spy.mockRestore();
    }
  });
});

it('reports a directory fsync failure that is not a platform limitation', async () => {
  await withTemp(async (directory) => {
    const probe = await open(directory, 'r');
    const prototype: { sync: () => Promise<void> } = Object.getPrototypeOf(probe) as {
      sync: () => Promise<void>;
    };
    await probe.close();
    let calls = 0;
    const original = prototype.sync;
    const spy = vi.spyOn(prototype, 'sync').mockImplementation(async function (this: {
      sync: () => Promise<void>;
    }) {
      calls += 1;
      if (calls > 1) {
        throw Object.assign(new Error('disk'), { code: 'EIO' });
      }
      return original.call(this);
    });
    try {
      const file = join(directory, 'note.html');
      await expect(writeAtomic(file, 'renamed')).rejects.toMatchObject({ code: 'EIO' });
      expect(await readFile(file, 'utf8')).toBe('renamed');
    } finally {
      spy.mockRestore();
    }
  });
});

it('fails when the parent directory is missing and creates nothing outside it', async () => {
  await withTemp(async (directory) => {
    const missing = join(directory, 'missing', 'note.html');
    await expect(writeAtomic(missing, 'x')).rejects.toThrow();
    expect(await readdir(directory)).toEqual([]);
  });
});
