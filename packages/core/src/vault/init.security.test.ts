import { existsSync } from 'node:fs';
import { lstat, mkdir, readFile, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { withTemp } from './fixture.ts';
import { initVault } from './init.ts';

it('does not write through a .gaveta symlink that leaves the target', async () => {
  await withTemp(async (parent) => {
    const root = join(parent, 'vault');
    const outside = join(parent, 'outside');
    await mkdir(root);
    await mkdir(outside);
    await symlink(outside, join(root, '.gaveta'), 'dir');
    await writeFile(join(parent, 'canary.txt'), 'canary');

    await expect(initVault({ cwd: root })).rejects.toMatchObject({
      code: 'E_PATH_OUTSIDE_VAULT',
    });

    expect(existsSync(join(outside, 'config.json'))).toBe(false);
    expect(existsSync(join(outside, 'theme.css'))).toBe(false);
    expect(existsSync(join(outside, 'index.sqlite'))).toBe(false);
    expect(await readFile(join(parent, 'canary.txt'), 'utf8')).toBe('canary');
  });
});

it('does not follow a symlink while resolving the target directory', async () => {
  await withTemp(async (parent) => {
    const root = join(parent, 'vault');
    const outside = join(parent, 'outside');
    await mkdir(root);
    await mkdir(outside);
    await symlink(outside, join(root, 'escape'), 'dir');

    await expect(initVault({ cwd: root, directory: 'escape' })).rejects.toMatchObject({
      code: 'E_PATH_OUTSIDE_VAULT',
    });
    await expect(initVault({ cwd: root, directory: 'escape/child' })).rejects.toMatchObject({
      code: 'E_PATH_OUTSIDE_VAULT',
    });

    expect(existsSync(join(outside, '.gaveta'))).toBe(false);
    expect(existsSync(join(outside, 'child'))).toBe(false);
  });
});

it('does not follow a theme.css symlink out of the vault', async () => {
  await withTemp(async (parent) => {
    const root = join(parent, 'vault');
    const secret = join(parent, 'secret.css');
    await mkdir(join(root, '.gaveta'), { recursive: true });
    await writeFile(secret, 'SECRET');
    await symlink(secret, join(root, '.gaveta', 'theme.css'));

    await expect(initVault({ cwd: root })).rejects.toMatchObject({
      code: 'E_PATH_OUTSIDE_VAULT',
    });

    expect(await readFile(secret, 'utf8')).toBe('SECRET');
    expect(existsSync(join(root, '.gaveta', 'config.json'))).toBe(false);
    expect(existsSync(join(root, '.gaveta', 'index.sqlite'))).toBe(false);
  });
});

it('refuses to replace a .gaveta file and writes nothing else', async () => {
  await withTemp(async (parent) => {
    const root = join(parent, 'vault');
    await mkdir(root);
    await writeFile(join(root, '.gaveta'), 'no');

    await expect(initVault({ cwd: root })).rejects.toMatchObject({ code: 'E_PATH_EXISTS' });

    expect(await readFile(join(root, '.gaveta'), 'utf8')).toBe('no');
    expect(existsSync(join(parent, 'config.json'))).toBe(false);
  });
});

it('does not write agent instructions through a symlink that leaves the target', async () => {
  await withTemp(async (parent) => {
    const root = join(parent, 'vault');
    const secret = join(parent, 'secret.md');
    await mkdir(root);
    await writeFile(secret, 'SECRET');
    await symlink(secret, join(root, 'AGENTS.md'));

    await expect(initVault({ cwd: root, agentInstructions: 'agents' })).rejects.toMatchObject({
      code: 'E_PATH_OUTSIDE_VAULT',
    });

    expect(await readFile(secret, 'utf8')).toBe('SECRET');
    expect((await lstat(join(root, 'AGENTS.md'))).isSymbolicLink()).toBe(true);
  });
});
