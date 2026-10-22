import { existsSync } from 'node:fs';
import { lstat, mkdir, readFile, realpath, symlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { expect, it } from 'vitest';
import { formatDiagnostic, GavetaError } from '../errors.ts';
import { withTemp } from './fixture.ts';
import { readVaultText, resolveInsideVault, writeVaultText } from './paths.ts';

const outsideText = formatDiagnostic('E_PATH_OUTSIDE_VAULT');
const outsideCode = {
  code: 'E_PATH_OUTSIDE_VAULT',
  message: outsideText.message,
  hint: outsideText.hint,
};

function swapCase(value: string): string {
  return Array.from(value, (char) => {
    const upper = char.toUpperCase();
    const lower = char.toLowerCase();
    if (char === lower && char !== upper) {
      return upper;
    }
    if (char === upper && char !== lower) {
      return lower;
    }
    return char;
  }).join('');
}

it('rejects .. that leaves the vault and does not create the outside file', async () => {
  await withTemp(async (parent) => {
    const root = join(parent, 'VaultCase');
    await mkdir(root);
    const outsideFile = join(parent, 'pwned.txt');

    await expect(writeVaultText(root, '../pwned.txt', 'x')).rejects.toBeInstanceOf(GavetaError);
    await expect(writeVaultText(root, '../pwned.txt', 'x')).rejects.toMatchObject(outsideCode);
    await expect(writeVaultText(root, 'foo/../../pwned.txt', 'x')).rejects.toMatchObject(
      outsideCode,
    );
    await expect(writeVaultText(root, 'a/b/../../../../etc/passwd', 'x')).rejects.toMatchObject(
      outsideCode,
    );

    expect(existsSync(outsideFile)).toBe(false);
    expect(existsSync(join(dirname(parent), 'pwned.txt'))).toBe(false);
  });
});

it('rejects a climb that would re-enter the vault', async () => {
  await withTemp(async (parent) => {
    const root = join(parent, 'VaultCase');
    await mkdir(root);
    const base = 'VaultCase';

    await expect(resolveInsideVault(root, `../${base}/inside.html`)).rejects.toMatchObject(
      outsideCode,
    );
  });
});

it('rejects absolute paths outside the vault and allows absolute paths inside it', async () => {
  await withTemp(async (parent) => {
    const root = join(parent, 'VaultCase');
    await mkdir(join(root, 'notes'), { recursive: true });
    const inside = join(root, 'notes', 'a.html');
    const outside = join(parent, 'secret.txt');
    await writeFile(outside, 'TOP-SECRET');

    await expect(readVaultText(root, outside)).rejects.toMatchObject(outsideCode);
    await expect(resolveInsideVault(root, '/etc/passwd')).rejects.toMatchObject(outsideCode);

    const resolved = await resolveInsideVault(root, inside);
    expect(resolved).toBe(join(await realpath(root), 'notes', 'a.html'));
  });
});

it('rejects a prefix sibling of the vault directory', async () => {
  await withTemp(async (parent) => {
    const root = join(parent, 'vault');
    const sibling = join(parent, 'vault-secret');
    await mkdir(root);
    await mkdir(sibling);
    await writeFile(join(sibling, 'secret.txt'), 'TOP-SECRET');

    await expect(readVaultText(root, join(sibling, 'secret.txt'))).rejects.toMatchObject(
      outsideCode,
    );
    expect(await readFile(join(sibling, 'secret.txt'), 'utf8')).toBe('TOP-SECRET');
  });
});

it('rejects a file symlink that points outside and does not return its contents', async () => {
  await withTemp(async (parent) => {
    const root = join(parent, 'VaultCase');
    await mkdir(root);
    const secret = join(parent, 'secret.txt');
    await writeFile(secret, 'TOP-SECRET');
    await symlink(secret, join(root, 'leak.html'));

    await expect(readVaultText(root, 'leak.html')).rejects.toMatchObject(outsideCode);
  });
});

it('rejects a directory symlink that points outside and does not write through it', async () => {
  await withTemp(async (parent) => {
    const root = join(parent, 'VaultCase');
    const outside = join(parent, 'outside-dir');
    await mkdir(root);
    await mkdir(outside);
    await symlink(outside, join(root, 'escape'), 'dir');

    await expect(writeVaultText(root, 'escape/pwned.txt', 'x')).rejects.toMatchObject(outsideCode);
    expect(existsSync(join(outside, 'pwned.txt'))).toBe(false);
  });
});

it('rejects a relative symlink that leaves the vault', async () => {
  await withTemp(async (parent) => {
    const root = join(parent, 'VaultCase');
    await mkdir(root);
    await symlink('../secret.txt', join(root, 'rel-link'));
    await writeFile(join(parent, 'secret.txt'), 'TOP-SECRET');

    await expect(readVaultText(root, 'rel-link')).rejects.toMatchObject(outsideCode);
  });
});

it('rejects a dangling symlink and a symlink loop', async () => {
  await withTemp(async (parent) => {
    const root = join(parent, 'VaultCase');
    await mkdir(root);
    await symlink(join(root, 'missing-target'), join(root, 'dangling'));
    await symlink('loop', join(root, 'loop'));

    await expect(resolveInsideVault(root, 'dangling')).rejects.toMatchObject(outsideCode);
    await expect(resolveInsideVault(root, 'loop')).rejects.toMatchObject(outsideCode);
  });
});

it('rejects .. after a symlink that points at the vault root', async () => {
  await withTemp(async (parent) => {
    const root = join(parent, 'VaultCase');
    await mkdir(root);
    await symlink(root, join(root, 'home'), 'dir');

    await expect(writeVaultText(root, 'home/../../pwned.txt', 'x')).rejects.toMatchObject(
      outsideCode,
    );

    expect(existsSync(join(parent, 'pwned.txt'))).toBe(false);
    expect(existsSync(join(dirname(parent), 'pwned.txt'))).toBe(false);
  });
});

it('allows .. that stays inside the vault', async () => {
  await withTemp(async (parent) => {
    const root = join(parent, 'VaultCase');
    await mkdir(join(root, 'notes'), { recursive: true });

    const resolved = await resolveInsideVault(root, 'notes/../notes/a.html');

    expect(resolved).toBe(join(await realpath(root), 'notes', 'a.html'));
  });
});

it('rejects a case-flipped vault prefix that climbs out', async () => {
  await withTemp(async (parent) => {
    const root = join(parent, 'VaultCase');
    await mkdir(root);
    const flipped = swapCase(await realpath(root));
    const attack = `${flipped}/../../pwned-case.txt`;

    await expect(resolveInsideVault(root, attack)).rejects.toMatchObject(outsideCode);
    expect(existsSync(join(dirname(parent), 'pwned-case.txt'))).toBe(false);
    expect(existsSync(join(parent, 'pwned-case.txt'))).toBe(false);
  });
});

it('rejects a unicode directory segment combined with .. that leaves the vault', async () => {
  await withTemp(async (parent) => {
    const root = join(parent, 'VaultCase');
    await mkdir(root);

    await expect(
      writeVaultText(root, 'caf\u00e9/../../pwned-unicode.txt', 'x'),
    ).rejects.toMatchObject(outsideCode);
    await expect(
      writeVaultText(root, 'cafe\u0301/../../pwned-unicode.txt', 'x'),
    ).rejects.toMatchObject(outsideCode);

    expect(existsSync(join(parent, 'pwned-unicode.txt'))).toBe(false);
    expect(existsSync(join(dirname(parent), 'pwned-unicode.txt'))).toBe(false);
  });
});

it('allows an NFD path that stays inside the vault', async () => {
  await withTemp(async (parent) => {
    const root = join(parent, 'VaultCase');
    const nfd = 'cafe\u0301';
    await mkdir(join(root, nfd), { recursive: true });

    const resolved = await resolveInsideVault(root, `${nfd}/nota.html`);

    expect(resolved.normalize('NFC')).toBe(
      join(await realpath(root), 'caf\u00e9', 'nota.html').normalize('NFC'),
    );
  });
});

it('does not URL-decode %2e%2e into a parent segment', async () => {
  await withTemp(async (parent) => {
    const root = join(parent, 'VaultCase');
    await mkdir(root);

    const resolved = await resolveInsideVault(root, '%2e%2e/%2e%2e/passwd');

    const realRoot = await realpath(root);
    expect(resolved.startsWith(`${realRoot}/`) || resolved.startsWith(`${realRoot}\\`)).toBe(true);
    expect(resolved).not.toBe('/etc/passwd');
  });
});

it('rejects a null byte in a vault path', async () => {
  await withTemp(async (parent) => {
    const root = join(parent, 'VaultCase');
    await mkdir(root);

    await expect(resolveInsideVault(root, 'notes/a.html\0.txt')).rejects.toMatchObject(outsideCode);
  });
});

it('allows ./ and duplicate slashes that stay inside', async () => {
  await withTemp(async (parent) => {
    const root = join(parent, 'VaultCase');
    await mkdir(join(root, 'notes'), { recursive: true });

    const resolved = await resolveInsideVault(root, './notes//a.html');

    expect(resolved).toBe(join(await realpath(root), 'notes', 'a.html'));
  });
});

it('follows an internal symlink for reads and does not follow it for writes', async () => {
  await withTemp(async (parent) => {
    const root = join(parent, 'VaultCase');
    await mkdir(root);
    await writeFile(join(root, 'real.html'), 'dentro');
    await symlink('real.html', join(root, 'alias.html'));

    expect(await readVaultText(root, 'alias.html')).toBe('dentro');

    await writeVaultText(root, 'alias.html', 'nuevo');

    expect(await readFile(join(root, 'real.html'), 'utf8')).toBe('dentro');
    expect((await lstat(join(root, 'alias.html'))).isSymbolicLink()).toBe(false);
    expect(await readFile(join(root, 'alias.html'), 'utf8')).toBe('nuevo');
  });
});

it('follows a directory symlink that stays inside the vault', async () => {
  await withTemp(async (parent) => {
    const root = join(parent, 'VaultCase');
    await mkdir(join(root, 'notes'), { recursive: true });
    await symlink('notes', join(root, 'alias-dir'), 'dir');

    await writeVaultText(root, 'alias-dir/a.html', 'hola');

    expect(await readFile(join(root, 'notes', 'a.html'), 'utf8')).toBe('hola');
    expect(await readVaultText(root, 'alias-dir/a.html')).toBe('hola');
  });
});

it('rejects reading or writing a directory inside the vault', async () => {
  await withTemp(async (parent) => {
    const root = join(parent, 'VaultCase');
    await mkdir(join(root, 'notes'), { recursive: true });
    await writeFile(join(root, 'notes', 'keep.html'), 'keep');

    await expect(readVaultText(root, 'notes')).rejects.toMatchObject(outsideCode);
    await expect(readVaultText(root, '.')).rejects.toMatchObject(outsideCode);
    await expect(writeVaultText(root, 'notes', 'x')).rejects.toMatchObject(outsideCode);
    expect(await readFile(join(root, 'notes', 'keep.html'), 'utf8')).toBe('keep');
  });
});

it('round-trips UTF-8 text through the guarded writer', async () => {
  await withTemp(async (parent) => {
    const root = join(parent, 'VaultCase');
    await mkdir(join(root, 'notes'), { recursive: true });

    await writeVaultText(root, 'notes/canción.html', 'cañón\n');

    expect(await readVaultText(root, 'notes/canción.html')).toBe('cañón\n');
  });
});
