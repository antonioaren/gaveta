import { createHash } from 'node:crypto';
import { lstat } from 'node:fs/promises';
import path from 'node:path';
import { GavetaError } from '../errors.ts';
import { DEFAULT_THEME_CSS } from '../theme/theme.ts';
import { readVaultConfig, writeVaultConfig, type VaultConfig } from './config.ts';
import { GAVETA_DIRECTORY } from './constants.ts';
import { pathOutsideVault } from './errors.ts';
import { isInsideVault, readVaultText, writeVaultText } from './paths.ts';

const THEME_RELATIVE_PATH = `${GAVETA_DIRECTORY}/theme.css`;

export interface VaultAssetUpgradeWarning {
  readonly code: 'W_VAULT_ASSET_MODIFIED';
  readonly path: string;
}

export interface UpgradeVaultAssetsResult {
  readonly upgraded: readonly string[];
  readonly warnings: readonly VaultAssetUpgradeWarning[];
  readonly configUpdated: boolean;
}

export function hashVaultAsset(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

/**
 * Refresh bundled vault assets (theme, future mermaid bundles) without touching notes.
 * User-modified theme files are detected by hash and left intact with a warning.
 */
export async function upgradeVaultAssets(
  vaultRoot: string,
  cliVersion: string,
): Promise<UpgradeVaultAssetsResult> {
  if (typeof vaultRoot !== 'string' || vaultRoot.length === 0) {
    throw new GavetaError('E_ARG_INVALID');
  }
  const config = await readVaultConfig(vaultRoot);
  const upgraded: string[] = [];
  const warnings: VaultAssetUpgradeWarning[] = [];
  const themePath = path.join(vaultRoot, ...THEME_RELATIVE_PATH.split('/'));
  if (!isInsideVault(vaultRoot, themePath)) {
    throw pathOutsideVault();
  }
  const listed = await lstatOrNull(themePath);
  const bundledHash = hashVaultAsset(DEFAULT_THEME_CSS);
  if (listed === null) {
    await writeVaultText(vaultRoot, THEME_RELATIVE_PATH, DEFAULT_THEME_CSS);
    upgraded.push(THEME_RELATIVE_PATH);
  } else if (listed.isFile()) {
    const existing = await readVaultText(vaultRoot, THEME_RELATIVE_PATH);
    const existingHash = hashVaultAsset(existing);
    if (existingHash === bundledHash) {
      // already matches the CLI bundle
    } else {
      warnings.push({ code: 'W_VAULT_ASSET_MODIFIED', path: THEME_RELATIVE_PATH });
    }
  } else {
    throw new GavetaError('E_PATH_EXISTS');
  }
  const nextConfig: VaultConfig = {
    ...config,
    assetsVersion: cliVersion,
  };
  const configUpdated = config.assetsVersion !== cliVersion;
  if (configUpdated) {
    await writeVaultConfig(vaultRoot, nextConfig);
  }
  return { upgraded, warnings, configUpdated };
}

export function vaultAssetsNeedUpgrade(config: VaultConfig, cliVersion: string): boolean {
  if (config.assetsVersion === undefined) {
    return true;
  }
  return config.assetsVersion !== cliVersion;
}

async function lstatOrNull(target: string): Promise<Awaited<ReturnType<typeof lstat>> | null> {
  try {
    return await lstat(target);
  } catch {
    return null;
  }
}
