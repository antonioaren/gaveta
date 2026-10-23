import path from 'node:path';

/** Paths under `.gaveta/` are owned by the indexer, not user notes. */
export function isGavetaInternalRelativePath(relativePath: string): boolean {
  const normalized = relativePath.replaceAll('\\', '/');
  return normalized === '.gaveta' || normalized.startsWith('.gaveta/');
}

/** Temp file created by {@link writeAtomic} in the same directory as the note. */
export function isAtomicTempRelativePath(relativePath: string): boolean {
  const base = path.basename(relativePath);
  return base.startsWith('.') && base.endsWith('.tmp');
}

export function isHtmlNoteRelativePath(relativePath: string): boolean {
  return relativePath.toLowerCase().endsWith('.html');
}

export function shouldIndexVaultRelativePath(relativePath: string): boolean {
  if (!isHtmlNoteRelativePath(relativePath)) {
    return false;
  }
  if (isGavetaInternalRelativePath(relativePath)) {
    return false;
  }
  if (isAtomicTempRelativePath(relativePath)) {
    return false;
  }
  return true;
}

export function toVaultRelativePath(vaultRoot: string, absolutePath: string): string | null {
  const relative = path.relative(vaultRoot, absolutePath);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    return null;
  }
  return relative.replaceAll('\\', '/');
}
