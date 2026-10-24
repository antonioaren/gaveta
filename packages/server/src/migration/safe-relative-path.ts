import { GavetaError } from '@gaveta/core';

/** Rejects traversal and absolute paths for uploaded import files (server boundary). */
export function assertSafeImportRelativePath(relativePath: string): string {
  const trimmed = relativePath.trim();
  if (trimmed.length === 0) {
    throw new GavetaError('E_ARG_INVALID');
  }
  if (trimmed.includes('\0') || trimmed.includes('\\')) {
    throw new GavetaError('E_ARG_INVALID');
  }
  const segments = trimmed.split('/');
  for (const segment of segments) {
    if (segment.length === 0 || segment === '.' || segment === '..') {
      throw new GavetaError('E_ARG_INVALID');
    }
    if (segment.startsWith('.')) {
      throw new GavetaError('E_ARG_INVALID');
    }
  }
  return segments.join('/');
}
