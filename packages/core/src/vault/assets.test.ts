import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { initVault } from './init.ts';
import { withTemp } from './fixture.ts';
import { upgradeVaultAssets, vaultAssetsNeedUpgrade } from './assets.ts';
import { readVaultConfig, writeVaultConfig } from './config.ts';
import { DEFAULT_THEME_CSS } from '../theme/theme.ts';
import { LEGACY_THEME_CSS } from './shipped-asset-hashes.ts';

it('upgrades missing theme and records assetsVersion', async () => {
  await withTemp(async (parent) => {
    const root = join(parent, 'vault');
    await mkdir(root, { recursive: true });
    await initVault({ cwd: root });
    const result = await upgradeVaultAssets(root, '0.1.0');
    expect(result.upgraded).toEqual([]);
    const config = await readVaultConfig(root);
    expect(config.assetsVersion).toBe('0.1.0');
    expect(vaultAssetsNeedUpgrade(config, '0.1.0')).toBe(false);
  });
});

it('replaces a bundled theme that still matches a known shipped hash', async () => {
  await withTemp(async (parent) => {
    const root = join(parent, 'vault');
    await mkdir(root, { recursive: true });
    await initVault({ cwd: root });
    await writeFile(join(root, '.gaveta', 'theme.css'), LEGACY_THEME_CSS);
    const config = await readVaultConfig(root);
    await writeVaultConfig(root, {
      rel: config.rel,
      remoteAllowlist: config.remoteAllowlist,
      assetsVersion: config.assetsVersion,
    });
    const result = await upgradeVaultAssets(root, '0.1.0');
    expect(result.upgraded).toContain('.gaveta/theme.css');
    expect(result.warnings).toEqual([]);
    expect(await readFile(join(root, '.gaveta', 'theme.css'), 'utf8')).toBe(DEFAULT_THEME_CSS);
  });
});

it('warns instead of overwriting a customized theme', async () => {
  await withTemp(async (parent) => {
    const root = join(parent, 'vault');
    await mkdir(root, { recursive: true });
    await initVault({ cwd: root });
    await writeFile(join(root, '.gaveta', 'theme.css'), '/* custom */\n');
    const result = await upgradeVaultAssets(root, '0.2.0');
    expect(result.warnings).toEqual([
      { code: 'W_VAULT_ASSET_MODIFIED', path: '.gaveta/theme.css' },
    ]);
    expect(await readFile(join(root, '.gaveta', 'theme.css'), 'utf8')).toBe('/* custom */\n');
    const config = await readVaultConfig(root);
    expect(config.assetsVersion).toBe('0.2.0');
  });
});

it('writes the bundled theme when the file is missing', async () => {
  await withTemp(async (parent) => {
    const root = join(parent, 'vault');
    await mkdir(root, { recursive: true });
    await initVault({ cwd: root });
    await writeFile(join(root, '.gaveta', 'theme.css'), '');
    const { unlink } = await import('node:fs/promises');
    await unlink(join(root, '.gaveta', 'theme.css'));
    const result = await upgradeVaultAssets(root, '0.1.0');
    expect(result.upgraded).toContain('.gaveta/theme.css');
    expect(await readFile(join(root, '.gaveta', 'theme.css'), 'utf8')).toBe(DEFAULT_THEME_CSS);
  });
});
