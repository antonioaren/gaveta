import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  BUNDLED_VAULT_ASSET_CONTENT,
  hashForBundledVaultAsset,
} from '../packages/core/src/vault/shipped-asset-hashes.ts';
import { DEMO_VAULT_RELATIVE } from '../scripts/bootstrap-demo-vault.ts';

const REPO_ROOT = join(import.meta.dirname, '..');

function sha256Bytes(bytes: Buffer | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function sha256OnDisk(absolutePath: string): string {
  return sha256Bytes(readFileSync(absolutePath));
}

function expectedAssetHash(vaultRoot: string, relative: string): string {
  const absolute = join(vaultRoot, relative);
  if (existsSync(absolute)) {
    return sha256OnDisk(absolute);
  }
  if (relative in BUNDLED_VAULT_ASSET_CONTENT) {
    return hashForBundledVaultAsset(relative);
  }
  throw new Error(`config lists ${relative} but the file is missing and it is not a bundled asset`);
}

function vaultsWithTrackedAssets(): readonly { readonly label: string; readonly root: string }[] {
  const candidates = [{ label: DEMO_VAULT_RELATIVE, root: join(REPO_ROOT, DEMO_VAULT_RELATIVE) }];
  return candidates.filter(({ root }) => {
    try {
      const config = JSON.parse(readFileSync(join(root, '.gaveta', 'config.json'), 'utf8')) as {
        assets?: unknown;
      };
      return (
        config.assets !== undefined && config.assets !== null && typeof config.assets === 'object'
      );
    } catch {
      return false;
    }
  });
}

describe('vault config asset hashes', () => {
  it('matches sha256 of on-disk files for every assets entry in config.json', () => {
    const vaults = vaultsWithTrackedAssets();
    expect(vaults.length).toBeGreaterThan(0);

    for (const { label, root } of vaults) {
      const config = JSON.parse(readFileSync(join(root, '.gaveta', 'config.json'), 'utf8')) as {
        assets: Record<string, string>;
      };
      for (const [relative, recordedHash] of Object.entries(config.assets)) {
        const actualHash = expectedAssetHash(root, relative);
        expect(actualHash, `${label} ${relative}`).toBe(recordedHash);
      }
    }
  });
});
