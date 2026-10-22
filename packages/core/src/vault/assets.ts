import { lstat } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { GavetaError } from '../errors.ts';
import {
  BUNDLED_VAULT_ASSET_CONTENT,
  BUNDLED_VAULT_ASSET_PATHS,
  hashForBundledVaultAsset,
  isKnownShippedAssetHash,
} from './shipped-asset-hashes.ts';
import { readVaultConfig, writeVaultConfig, type VaultConfig } from './config.ts';
import { pathOutsideVault } from './errors.ts';
import { isInsideVault, readVaultText, writeVaultText } from './paths.ts';

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

export function bundledVaultAssetHashes(): Record<string, string> {
  const hashes: Record<string, string> = {};
  for (const relative of BUNDLED_VAULT_ASSET_PATHS) {
    hashes[relative] = hashForBundledVaultAsset(relative);
  }
  return hashes;
}

/**
 * Refresh bundled vault assets (theme, mermaid bundles) without touching notes.
 * User-modified files are detected via recorded hashes and left intact with a warning.
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
  for (const relative of BUNDLED_VAULT_ASSET_PATHS) {
    const bundled = BUNDLED_VAULT_ASSET_CONTENT[relative];
    if (bundled === undefined) {
      continue;
    }
    const result = await syncBundledAsset(vaultRoot, relative, bundled, config.assets);
    upgraded.push(...result.upgraded);
    warnings.push(...result.warnings);
  }
  const nextAssets = bundledVaultAssetHashes();
  const assetsChanged =
    config.assets === undefined ||
    BUNDLED_VAULT_ASSET_PATHS.some(
      (relative) => config.assets?.[relative] !== nextAssets[relative],
    );
  const nextConfig: VaultConfig = {
    ...config,
    assetsVersion: cliVersion,
    assets: nextAssets,
  };
  const configUpdated = config.assetsVersion !== cliVersion || assetsChanged;
  if (configUpdated) {
    await writeVaultConfig(vaultRoot, nextConfig);
  }
  return { upgraded, warnings, configUpdated };
}

export function vaultAssetsNeedUpgrade(config: VaultConfig, cliVersion: string): boolean {
  if (config.assetsVersion === undefined) {
    return true;
  }
  if (config.assetsVersion !== cliVersion) {
    return true;
  }
  const bundled = bundledVaultAssetHashes();
  if (config.assets === undefined) {
    return true;
  }
  return BUNDLED_VAULT_ASSET_PATHS.some(
    (relative) => config.assets?.[relative] !== bundled[relative],
  );
}

async function syncBundledAsset(
  vaultRoot: string,
  relative: string,
  bundled: string,
  recordedAssets: VaultConfig['assets'],
): Promise<{ upgraded: string[]; warnings: VaultAssetUpgradeWarning[] }> {
  const absolute = path.join(vaultRoot, ...relative.split('/'));
  if (!isInsideVault(vaultRoot, absolute)) {
    throw pathOutsideVault();
  }
  const listed = await lstatOrNull(absolute);
  const bundledHash = hashVaultAsset(bundled);
  const upgraded: string[] = [];
  const warnings: VaultAssetUpgradeWarning[] = [];
  if (listed === null) {
    await writeVaultText(vaultRoot, relative, bundled);
    upgraded.push(relative);
    return { upgraded, warnings };
  }
  if (!listed.isFile()) {
    throw new GavetaError('E_PATH_EXISTS');
  }
  const existing = await readVaultText(vaultRoot, relative);
  const existingHash = hashVaultAsset(existing);
  if (existingHash === bundledHash) {
    return { upgraded, warnings };
  }
  const recordedHash = recordedAssets?.[relative];
  const matchesRecorded = recordedHash !== undefined && existingHash === recordedHash;
  const matchesShippedWhenUnrecorded =
    recordedHash === undefined && isKnownShippedAssetHash(relative, existingHash);
  if (matchesRecorded || matchesShippedWhenUnrecorded) {
    await writeVaultText(vaultRoot, relative, bundled);
    upgraded.push(relative);
    return { upgraded, warnings };
  }
  warnings.push({ code: 'W_VAULT_ASSET_MODIFIED', path: relative });
  return { upgraded, warnings };
}

async function lstatOrNull(target: string): Promise<Awaited<ReturnType<typeof lstat>> | null> {
  try {
    return await lstat(target);
  } catch {
    return null;
  }
}
