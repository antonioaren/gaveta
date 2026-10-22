import { createHash } from 'node:crypto';
import {
  DEFAULT_MERMAID_BOOT_JS,
  DEFAULT_MERMAID_LICENSE,
  DEFAULT_MERMAID_MIN_JS,
  MERMAID_BOOT_RELATIVE,
  MERMAID_LICENSE_RELATIVE,
  MERMAID_MIN_RELATIVE,
} from '../mermaid/assets.ts';
import { DEFAULT_THEME_CSS } from '../theme/theme.ts';
import { GAVETA_DIRECTORY } from './constants.ts';

const THEME_RELATIVE_PATH = `${GAVETA_DIRECTORY}/theme.css`;

/** Legacy theme.css shipped before per-vault asset hash tracking. */
export const LEGACY_THEME_CSS = `/* gaveta default theme */\n`;

function sha256(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

export const BUNDLED_VAULT_ASSET_PATHS: readonly string[] = [
  THEME_RELATIVE_PATH,
  MERMAID_MIN_RELATIVE,
  MERMAID_BOOT_RELATIVE,
  MERMAID_LICENSE_RELATIVE,
];

export const BUNDLED_VAULT_ASSET_CONTENT: Readonly<Record<string, string>> = {
  [THEME_RELATIVE_PATH]: DEFAULT_THEME_CSS,
  [MERMAID_MIN_RELATIVE]: DEFAULT_MERMAID_MIN_JS,
  [MERMAID_BOOT_RELATIVE]: DEFAULT_MERMAID_BOOT_JS,
  [MERMAID_LICENSE_RELATIVE]: DEFAULT_MERMAID_LICENSE,
};

/**
 * Known content hashes for each bundled vault asset. When a release changes bundled
 * files, append the previous release hash here so upgrades can replace untouched files.
 */
export const SHIPPED_VAULT_ASSET_HASHES: Readonly<Record<string, readonly string[]>> = {
  [THEME_RELATIVE_PATH]: [sha256(DEFAULT_THEME_CSS), sha256(LEGACY_THEME_CSS)],
  [MERMAID_MIN_RELATIVE]: [sha256(DEFAULT_MERMAID_MIN_JS)],
  [MERMAID_BOOT_RELATIVE]: [sha256(DEFAULT_MERMAID_BOOT_JS)],
  [MERMAID_LICENSE_RELATIVE]: [sha256(DEFAULT_MERMAID_LICENSE)],
};

export function hashForBundledVaultAsset(relative: string): string {
  const content = BUNDLED_VAULT_ASSET_CONTENT[relative];
  if (content === undefined) {
    throw new Error(`unknown bundled vault asset: ${relative}`);
  }
  return sha256(content);
}

export function isKnownShippedAssetHash(relative: string, fileHash: string): boolean {
  const known = SHIPPED_VAULT_ASSET_HASHES[relative];
  if (known === undefined) {
    return false;
  }
  return known.includes(fileHash);
}
