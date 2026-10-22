import { posix } from 'node:path';
import { join } from 'node:path';

export const VAULT_NAMES = ['empty', 'backlinks', 'problems', 'malicious'] as const;

export type VaultName = (typeof VAULT_NAMES)[number];

export const FIXTURES_ROOT = join(import.meta.dirname, '..');

export function vaultPath(name: VaultName): string {
  return join(FIXTURES_ROOT, 'vaults', name);
}

/** Stylesheet href a note at `notePath` needs to reach `.gaveta/theme.css`. */
export function themeHrefFor(notePath: string): string {
  const depth = notePath.split('/').length - 1;
  return `${'../'.repeat(depth)}.gaveta/theme.css`;
}

/**
 * Resolve a reference against the note that contains it.
 * Returns a vault-relative path, or null when the reference is not a relative
 * path that stays inside the vault (schemes, `//`, leading `/`, backslash, `..`).
 */
export function resolveInsideVault(fromPath: string, reference: string): string | null {
  const trimmed = reference.trim();
  if (
    trimmed === '' ||
    trimmed.startsWith('//') ||
    trimmed.startsWith('/') ||
    trimmed.includes('\\') ||
    trimmed.includes('\0')
  ) {
    return null;
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) {
    return null;
  }
  const withoutHash = trimmed.split('#')[0] ?? '';
  const pathOnly = withoutHash.split('?')[0] ?? '';
  if (pathOnly === '') {
    return null;
  }
  const resolved = posix.normalize(posix.join(posix.dirname(fromPath), pathOnly));
  if (resolved === '..' || resolved.startsWith('../') || resolved.startsWith('/')) {
    return null;
  }
  return resolved;
}
