import { GavetaError } from '../errors.ts';
import { GAVETA_DIRECTORY } from '../vault/constants.ts';

/** Normalize a vault folder path (no leading/trailing slashes, no `.` segments). */
export function normalizeVaultFolder(folder: string): string {
  if (typeof folder !== 'string' || folder.includes('\0')) {
    throw new GavetaError('E_ARG_INVALID');
  }
  if (folder.includes('\\') || folder.startsWith('/') || isDrivePath(folder)) {
    throw new GavetaError('E_PATH_OUTSIDE_VAULT');
  }
  let body = folder.trim();
  while (body.startsWith('./')) {
    body = body.slice(2);
  }
  while (body.endsWith('/')) {
    body = body.slice(0, -1);
  }
  if (body.length === 0) {
    throw new GavetaError('E_ARG_INVALID');
  }
  const segments = body.split('/');
  for (const segment of segments) {
    if (segment === '..') {
      throw new GavetaError('E_PATH_OUTSIDE_VAULT');
    }
    if (segment.length === 0 || segment === '.') {
      throw new GavetaError('E_ARG_INVALID');
    }
    if (segment === GAVETA_DIRECTORY || segment.startsWith('.')) {
      throw new GavetaError('E_ARG_INVALID');
    }
  }
  return body;
}

export function remapNotePath(notePath: string, fromFolder: string, toFolder: string): string {
  const prefix = `${fromFolder}/`;
  if (!notePath.startsWith(prefix) || !notePath.toLowerCase().endsWith('.html')) {
    throw new GavetaError('E_ARG_INVALID');
  }
  const tail = notePath.slice(prefix.length);
  return `${toFolder}/${tail}`;
}

export function assertFolderMoveAllowed(fromFolder: string, toFolder: string): void {
  if (fromFolder === toFolder) {
    throw new GavetaError('E_ARG_INVALID');
  }
  if (toFolder.startsWith(`${fromFolder}/`) || fromFolder.startsWith(`${toFolder}/`)) {
    throw new GavetaError('E_ARG_INVALID');
  }
}

function isDrivePath(folder: string): boolean {
  const first = folder[0];
  const second = folder[1];
  if (first === undefined || second !== ':') {
    return false;
  }
  return (first >= 'A' && first <= 'Z') || (first >= 'a' && first <= 'z');
}
