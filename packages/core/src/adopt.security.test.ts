import { existsSync } from 'node:fs';
import { lstat, mkdir, readFile, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { adoptNote } from './adopt.ts';
import { createDefaultVaultConfig, writeVaultConfig } from './vault/config.ts';
import { withTemp } from './vault/fixture.ts';
import { openVaultIndex } from './sqlite/store.ts';
import { DEFAULT_THEME_CSS } from './theme/theme.ts';
import { validateNote } from './validate.ts';

const NOTE_ID = '01JB7Z3K9QX4T5M2N8V6R0WYHC';
const CREATED = '2026-10-22T10:00:00.000Z';

async function makeVault(parent: string): Promise<string> {
  const root = join(parent, 'vault');
  await mkdir(join(root, '.gaveta'), { recursive: true });
  await writeVaultConfig(root, createDefaultVaultConfig());
  await writeFile(join(root, '.gaveta/theme.css'), DEFAULT_THEME_CSS);
  const index = await openVaultIndex(root);
  index.close();
  return root;
}

it('rejects path traversal and does not create or modify the outside file', async () => {
  await withTemp(async (parent) => {
    const root = await makeVault(parent);
    const secret = join(parent, 'secret.html');
    await writeFile(secret, '<p>secret</p>');
    await writeFile(join(parent, 'canary.txt'), 'canary');

    await expect(adoptNote(root, '../secret.html')).rejects.toMatchObject({
      code: 'E_PATH_OUTSIDE_VAULT',
    });
    await expect(adoptNote(root, 'notes/../../secret.html')).rejects.toMatchObject({
      code: 'E_PATH_OUTSIDE_VAULT',
    });
    await expect(adoptNote(root, secret)).rejects.toMatchObject({
      code: 'E_PATH_OUTSIDE_VAULT',
    });
    await expect(adoptNote(root, 'nota.html\0.txt')).rejects.toMatchObject({
      code: 'E_PATH_OUTSIDE_VAULT',
    });

    expect(await readFile(secret, 'utf8')).toBe('<p>secret</p>');
    expect(await readFile(join(parent, 'canary.txt'), 'utf8')).toBe('canary');
    expect(existsSync(join(root, 'secret.html'))).toBe(false);
    expect(existsSync(join(parent, 'pwned.txt'))).toBe(false);
  });
});

it('rejects a symlink that leaves the vault and does not follow an inside symlink for the write', async () => {
  await withTemp(async (parent) => {
    const root = await makeVault(parent);
    const secret = join(parent, 'secret.html');
    await writeFile(secret, '<p>secret</p>');
    await symlink(secret, join(root, 'leak.html'));
    const original = '<p>Dentro</p>';
    await writeFile(join(root, 'real.html'), original);
    await symlink('real.html', join(root, 'alias.html'));

    await expect(adoptNote(root, 'leak.html')).rejects.toMatchObject({
      code: 'E_PATH_OUTSIDE_VAULT',
    });
    expect(await readFile(secret, 'utf8')).toBe('<p>secret</p>');

    const adopted = await adoptNote(root, 'alias.html', {
      now: () => CREATED,
      createId: () => NOTE_ID,
    });
    expect(adopted.adopted).toBe(true);
    expect(await readFile(join(root, 'real.html'), 'utf8')).toBe(original);
    expect((await lstat(join(root, 'alias.html'))).isSymbolicLink()).toBe(false);
    expect(await readFile(join(root, 'alias.html'), 'utf8')).toContain(NOTE_ID);
  });
});

it('strips hostile HTML and does not overwrite neighbouring files', async () => {
  await withTemp(async (parent) => {
    const root = await makeVault(parent);
    const hostile = [
      '<!doctype html>',
      '<html lang="es"><head><title>Ataque</title></head><body>',
      '<article>',
      '<h1>Ataque</h1>',
      '<script>alert(1)</script>',
      '<p onclick="alert(2)" style="color:red">Visible</p>',
      '<a href="javascript:alert(3)">pulsa</a>',
      '<iframe src="https://evil.example/x"></iframe>',
      '<img src="https://evil.example/a.png" alt="foto">',
      '</article>',
      '</body></html>',
    ].join('');
    await writeFile(join(root, 'nota.html'), hostile);
    await writeFile(join(root, 'otro.html'), 'no tocar');
    await writeFile(join(parent, 'canary.txt'), 'canary');

    const result = await adoptNote(root, 'nota.html', {
      now: () => CREATED,
      createId: () => NOTE_ID,
    });
    expect(result.adopted).toBe(true);
    const codes = result.warnings.map((warning) => warning.code);
    expect(codes).toContain('W_UNSAFE_REMOVED');
    expect(codes).toContain('W_INLINE_STYLE_REMOVED');
    expect(codes).toContain('W_REMOTE_RESOURCE');

    const html = await readFile(join(root, 'nota.html'), 'utf8');
    expect(html.includes('<script')).toBe(false);
    expect(html.includes('onclick')).toBe(false);
    expect(html.toLowerCase().includes('javascript:')).toBe(false);
    expect(html.toLowerCase().includes('iframe')).toBe(false);
    expect(html.includes('evil.example')).toBe(false);
    expect(html.includes('alert(1)')).toBe(false);
    expect(html.includes('Visible')).toBe(true);
    expect(validateNote(html, { notePath: 'nota.html' }).ok).toBe(true);

    const index = await openVaultIndex(root);
    try {
      expect(index.note('nota.html')?.id).toBe(NOTE_ID);
      expect(index.note('otro.html')).toBeNull();
    } finally {
      index.close();
    }
    expect(await readFile(join(root, 'otro.html'), 'utf8')).toBe('no tocar');
    expect(await readFile(join(parent, 'canary.txt'), 'utf8')).toBe('canary');
    expect(existsSync(join(parent, 'nota.html'))).toBe(false);
  });
});

it('refuses directories and non-html files without writing', async () => {
  await withTemp(async (parent) => {
    const root = await makeVault(parent);
    await mkdir(join(root, 'carpeta'));
    await writeFile(join(root, 'nota.txt'), 'texto');

    await expect(adoptNote(root, 'carpeta')).rejects.toMatchObject({ code: 'E_ARG_INVALID' });
    await expect(adoptNote(root, 'nota.txt')).rejects.toMatchObject({ code: 'E_ARG_INVALID' });
    await expect(adoptNote(root, 'falta.html')).rejects.toMatchObject({ code: 'E_REF_NOT_FOUND' });
    await expect(adoptNote(root, '.gaveta/theme.css')).rejects.toMatchObject({
      code: 'E_ARG_INVALID',
    });

    expect(await readFile(join(root, 'nota.txt'), 'utf8')).toBe('texto');
    expect(existsSync(join(root, '.gaveta/theme.css'))).toBe(true);
    expect(await readFile(join(root, '.gaveta/theme.css'), 'utf8')).toBe(DEFAULT_THEME_CSS);
  });
});
