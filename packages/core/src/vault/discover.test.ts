import { mkdir, realpath, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { formatDiagnostic, GavetaError } from '../errors.ts';
import { discoverVault } from './discover.ts';
import { withTemp } from './fixture.ts';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

async function makeVault(parent: string, name: string): Promise<string> {
  const root = join(parent, name);
  await mkdir(join(root, '.gaveta'), { recursive: true });
  return root;
}

it('prefers --vault over GAVETA_VAULT and over a vault found by walking', async () => {
  await withTemp(async (parent) => {
    const byOption = await makeVault(parent, 'by-option');
    const byEnv = await makeVault(parent, 'by-env');
    const byWalk = await makeVault(parent, 'by-walk');
    const nested = join(byWalk, 'nested');
    await mkdir(nested);

    const location = await discoverVault({
      vaultOption: byOption,
      env: { GAVETA_VAULT: byEnv },
      cwd: nested,
    });

    expect(location).toEqual({ root: await realpath(byOption), source: 'option' });
  });
});

it('uses GAVETA_VAULT when --vault is omitted, without walking', async () => {
  await withTemp(async (parent) => {
    const byEnv = await makeVault(parent, 'by-env');
    const byWalk = await makeVault(parent, 'by-walk');
    const nested = join(byWalk, 'nested');
    await mkdir(nested);

    const location = await discoverVault({
      env: { GAVETA_VAULT: byEnv },
      cwd: nested,
    });

    expect(location).toEqual({ root: await realpath(byEnv), source: 'env' });
  });
});

it('walks upward from cwd until it finds .gaveta', async () => {
  await withTemp(async (parent) => {
    const vault = await makeVault(parent, 'vault');
    const nested = join(vault, 'a', 'b');
    await mkdir(nested, { recursive: true });

    const location = await discoverVault({ cwd: nested, env: {} });

    expect(location).toEqual({ root: await realpath(vault), source: 'search' });
  });
});

it('chooses the nearest ancestor when several directories contain .gaveta', async () => {
  await withTemp(async (parent) => {
    const outer = await makeVault(parent, 'outer');
    const inner = join(outer, 'inner');
    await mkdir(join(inner, '.gaveta'), { recursive: true });

    const location = await discoverVault({ cwd: inner, env: {} });

    expect(location.root).toBe(await realpath(inner));
  });
});

it('ignores a file named .gaveta and keeps walking', async () => {
  await withTemp(async (parent) => {
    const vault = await makeVault(parent, 'vault');
    const child = join(vault, 'child');
    await mkdir(child);
    await writeFile(join(child, '.gaveta'), 'not a directory');

    const location = await discoverVault({ cwd: child, env: {} });

    expect(location.root).toBe(await realpath(vault));
  });
});

it('resolves a relative --vault and a symlinked vault to the real root', async () => {
  await withTemp(async (parent) => {
    const vault = await makeVault(parent, 'vault');
    const outside = join(parent, 'outside');
    await mkdir(outside);
    await symlink(vault, join(parent, 'link'), 'dir');

    const byRelative = await discoverVault({
      vaultOption: '../vault',
      cwd: outside,
      env: {},
    });
    const byLink = await discoverVault({
      vaultOption: join(parent, 'link'),
      cwd: outside,
      env: { GAVETA_VAULT: join(parent, 'missing') },
    });

    expect(byRelative.root).toBe(await realpath(vault));
    expect(byLink).toEqual({ root: await realpath(vault), source: 'option' });
  });
});

it('resolves a relative GAVETA_VAULT against cwd', async () => {
  await withTemp(async (parent) => {
    const vault = await makeVault(parent, 'vault');
    const outside = join(parent, 'outside');
    await mkdir(outside);

    const location = await discoverVault({
      cwd: outside,
      env: { GAVETA_VAULT: '../vault' },
    });

    expect(location).toEqual({ root: await realpath(vault), source: 'env' });
  });
});

it('does not fall through when --vault is set but is not a vault', async () => {
  await withTemp(async (parent) => {
    const vault = await makeVault(parent, 'vault');
    const nested = join(vault, 'nested');
    await mkdir(nested);

    await expect(
      discoverVault({
        vaultOption: join(parent, 'missing'),
        env: { GAVETA_VAULT: vault },
        cwd: nested,
      }),
    ).rejects.toMatchObject({ code: 'E_VAULT_NOT_FOUND' });

    await expect(
      discoverVault({
        vaultOption: '',
        env: { GAVETA_VAULT: vault },
        cwd: nested,
      }),
    ).rejects.toMatchObject({ code: 'E_VAULT_NOT_FOUND' });
  });
});

it('does not walk when GAVETA_VAULT is set but is not a vault', async () => {
  await withTemp(async (parent) => {
    const vault = await makeVault(parent, 'vault');
    const nested = join(vault, 'nested');
    await mkdir(nested);

    await expect(
      discoverVault({
        cwd: nested,
        env: { GAVETA_VAULT: join(parent, 'missing') },
      }),
    ).rejects.toMatchObject({ code: 'E_VAULT_NOT_FOUND' });
  });
});

it('treats an empty GAVETA_VAULT as unset and walks', async () => {
  await withTemp(async (parent) => {
    const vault = await makeVault(parent, 'vault');
    const nested = join(vault, 'nested');
    await mkdir(nested);

    const location = await discoverVault({
      cwd: nested,
      env: { GAVETA_VAULT: '' },
    });

    expect(location).toEqual({ root: await realpath(vault), source: 'search' });
  });
});

it('fails with E_VAULT_NOT_FOUND when no marker exists', async () => {
  await withTemp(async (parent) => {
    const formatted = formatDiagnostic('E_VAULT_NOT_FOUND');
    await expect(discoverVault({ cwd: parent, env: {} })).rejects.toMatchObject({
      name: 'GavetaError',
      code: 'E_VAULT_NOT_FOUND',
      message: formatted.message,
      hint: formatted.hint,
    });
    await expect(discoverVault({ cwd: parent, env: {} })).rejects.toBeInstanceOf(GavetaError);
  });
});

it('rejects a .gaveta symlink that leaves the candidate root', async () => {
  await withTemp(async (parent) => {
    const vault = await makeVault(parent, 'vault');
    const child = join(vault, 'child');
    const outside = join(parent, 'outside-marker');
    await mkdir(child);
    await mkdir(outside);
    await symlink(outside, join(child, '.gaveta'), 'dir');

    await expect(discoverVault({ cwd: child, env: {} })).rejects.toMatchObject({
      code: 'E_PATH_OUTSIDE_VAULT',
      message: formatDiagnostic('E_PATH_OUTSIDE_VAULT').message,
    });
  });
});

it('reads GAVETA_VAULT from process.env when env is omitted', async () => {
  await withTemp(async (parent) => {
    const vault = await makeVault(parent, 'vault');
    const elsewhere = join(parent, 'elsewhere');
    await mkdir(elsewhere);
    vi.stubEnv('GAVETA_VAULT', vault);

    const location = await discoverVault({ cwd: elsewhere });

    expect(location).toEqual({ root: await realpath(vault), source: 'env' });
  });
});

it('defaults the start directory to process.cwd()', async () => {
  await withTemp(async (parent) => {
    const vault = await makeVault(parent, 'vault');
    const nested = join(vault, 'sub');
    await mkdir(nested);
    vi.spyOn(process, 'cwd').mockReturnValue(nested);

    const location = await discoverVault({ env: {} });

    expect(location).toEqual({ root: await realpath(vault), source: 'search' });
  });
});

it('rejects a null byte in --vault', async () => {
  await withTemp(async (parent) => {
    await expect(
      discoverVault({ vaultOption: `bad\0vault`, cwd: parent, env: {} }),
    ).rejects.toMatchObject({ code: 'E_PATH_OUTSIDE_VAULT' });
  });
});

it('does not treat a directory without .gaveta as a vault just because a parent has one, when --vault is explicit', async () => {
  await withTemp(async (parent) => {
    const vault = await makeVault(parent, 'vault');
    const nested = join(vault, 'nested');
    await mkdir(nested);

    await expect(
      discoverVault({ vaultOption: nested, cwd: parent, env: {} }),
    ).rejects.toMatchObject({ code: 'E_VAULT_NOT_FOUND' });
  });
});
