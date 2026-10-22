import { lstat, realpath, stat } from 'node:fs/promises';
import { GavetaError } from '../errors.ts';
import { inspectVaultPath } from '../links/path.ts';
import { GAVETA_DIRECTORY } from '../vault/constants.ts';
import { hasNodeErrorCode } from '../vault/node-error.ts';
import { pathOutsideVault } from '../vault/errors.ts';
import { isInsideVault, resolveInsideVault } from '../vault/paths.ts';

type EntryKind = 'missing' | 'file' | 'directory';

/** Vault-relative note path for `mv`. A trailing slash, or an existing directory, keeps the file name. */
export async function resolveDestination(
  root: string,
  sourcePath: string,
  destination: string,
): Promise<string> {
  if (typeof destination !== 'string') {
    throw new GavetaError('E_ARG_INVALID');
  }
  const trimmed = destination.trim();
  if (trimmed.length === 0 || trimmed.includes('\0')) {
    throw new GavetaError('E_ARG_INVALID');
  }
  const asDirectory = trimmed.endsWith('/');
  const inspected = inspectVaultPath(trimmed);
  if (!inspected.ok) {
    throw pathFailure(inspected.reason);
  }
  if (isGavetaPath(inspected.path)) {
    throw new GavetaError('E_ARG_INVALID');
  }

  let target = inspected.path;
  const kind = await entryKind(root, target);
  if (asDirectory || kind === 'directory') {
    const base = sourcePath.split('/').pop();
    if (!base?.toLowerCase().endsWith('.html')) {
      throw new GavetaError('E_ARG_INVALID');
    }
    target = `${target}/${base}`;
  } else if (!target.toLowerCase().endsWith('.html')) {
    target = `${target}.html`;
  }
  if (isGavetaPath(target)) {
    throw new GavetaError('E_ARG_INVALID');
  }
  if (target === sourcePath) {
    return target;
  }
  const finalKind = await entryKind(root, target);
  if (finalKind !== 'missing') {
    throw new GavetaError('E_PATH_EXISTS');
  }
  return target;
}

function isGavetaPath(value: string): boolean {
  return value === GAVETA_DIRECTORY || value.startsWith(`${GAVETA_DIRECTORY}/`);
}

async function entryKind(root: string, userPath: string): Promise<EntryKind> {
  const rootReal = await realpath(root);
  const absolute = await resolveInsideVault(rootReal, userPath);
  if (!isInsideVault(rootReal, absolute)) {
    throw pathOutsideVault();
  }
  let listed;
  try {
    listed = await lstat(absolute);
  } catch (error) {
    if (hasNodeErrorCode(error, 'ENOENT')) {
      return 'missing';
    }
    throw error;
  }
  if (listed.isSymbolicLink()) {
    const real = await realpath(absolute);
    if (!isInsideVault(rootReal, real)) {
      throw pathOutsideVault();
    }
    const info = await stat(real);
    if (info.isDirectory()) {
      return 'directory';
    }
    if (info.isFile()) {
      return 'file';
    }
    throw new GavetaError('E_PATH_EXISTS');
  }
  if (listed.isDirectory()) {
    return 'directory';
  }
  if (listed.isFile()) {
    return 'file';
  }
  throw new GavetaError('E_PATH_EXISTS');
}

function pathFailure(reason: 'outside' | 'unsafe-url' | 'empty'): GavetaError {
  if (reason === 'unsafe-url') {
    return new GavetaError('E_UNSAFE_URL');
  }
  if (reason === 'empty') {
    return new GavetaError('E_ARG_INVALID');
  }
  return new GavetaError('E_PATH_OUTSIDE_VAULT');
}
