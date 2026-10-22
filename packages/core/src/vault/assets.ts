import { createHash } from 'node:crypto';
import { lstat } from 'node:fs/promises';
import path from 'node:path';
import { GavetaError } from '../errors.ts';
import {
  DEFAULT_MERMAID_BOOT_JS,
  DEFAULT_MERMAID_LICENSE,
  DEFAULT_MERMAID_MIN_JS,
  MERMAID_BOOT_RELATIVE,
  MERMAID_LICENSE_RELATIVE,
  MERMAID_MIN_RELATIVE,
} from '../mermaid/assets.ts';
import { DEFAULT_THEME_CSS } from '../theme/theme.ts';
import { readVaultConfig, writeVaultConfig, type VaultConfig } from './config.ts';
import { GAVETA_DIRECTORY } from './constants.ts';
import { pathOutsideVault } from './errors.ts';
import { isInsideVault, readVaultText, writeVaultText } from './paths.ts';

const THEME_RELATIVE_PATH = `${GAVETA_DIRECTORY}/theme.css`;

const BUNDLED_VAULT_ASSETS: readonly { readonly relative: string; readonly content: string }[] = [
  { relative: THEME_RELATIVE_PATH, content: DEFAULT_THEME_CSS },
  { relative: MERMAID_MIN_RELATIVE, content: DEFAULT_MERMAID_MIN_JS },
  { relative: MERMAID_BOOT_RELATIVE, content: DEFAULT_MERMAID_BOOT_JS },
  { relative: MERMAID_LICENSE_RELATIVE, content: DEFAULT_MERMAID_LICENSE },
];

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
 * Refresh bundled vault assets (theme, mermaid bundles) without touching notes.
 * User-modified files are detected by hash and left intact with a warning.
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
  for (const asset of BUNDLED_VAULT_ASSETS) {
    const result = await syncBundledAsset(vaultRoot, asset.relative, asset.content);
    upgraded.push(...result.upgraded);
    warnings.push(...result.warnings);
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

async function syncBundledAsset(
  vaultRoot: string,
  relative: string,
  bundled: string,
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
  if (hashVaultAsset(existing) !== bundledHash) {
    warnings.push({ code: 'W_VAULT_ASSET_MODIFIED', path: relative });
  }
  return { upgraded, warnings };
}

async function lstatOrNull(target: string): Promise<Awaited<ReturnType<typeof lstat>> | null> {
  try {
    return await lstat(target);
  } catch {
    return null;
  }
}
