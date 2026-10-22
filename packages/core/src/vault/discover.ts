import { lstat, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { GAVETA_DIRECTORY, GAVETA_VAULT_ENV } from './constants.ts';
import { pathOutsideVault, vaultNotFound } from './errors.ts';
import { hasNodeErrorCode } from './node-error.ts';
import { isInsideVault } from './paths.ts';

export { GAVETA_DIRECTORY, GAVETA_VAULT_ENV };

export interface DiscoverVaultOptions {
  vaultOption?: string | undefined;
  env?: NodeJS.ProcessEnv | undefined;
  cwd?: string | undefined;
}

export interface VaultLocation {
  root: string;
  source: 'option' | 'env' | 'search';
}

export async function discoverVault(options: DiscoverVaultOptions = {}): Promise<VaultLocation> {
  const cwd = options.cwd ?? process.cwd();
  if (options.vaultOption !== undefined) {
    return { root: await locateExplicit(options.vaultOption, cwd), source: 'option' };
  }
  const env = options.env ?? process.env;
  const configured = env[GAVETA_VAULT_ENV];
  if (typeof configured === 'string' && configured.length > 0) {
    return { root: await locateExplicit(configured, cwd), source: 'env' };
  }
  return { root: await searchUpward(cwd), source: 'search' };
}

async function locateExplicit(input: string, cwd: string): Promise<string> {
  if (!isSafePathInput(input) || !isSafePathInput(cwd)) {
    throw pathOutsideVault();
  }
  const found = await vaultRootFromCandidate(path.resolve(cwd, input));
  if (found === null) {
    throw vaultNotFound();
  }
  return found;
}

async function searchUpward(start: string): Promise<string> {
  if (!isSafePathInput(start)) {
    throw pathOutsideVault();
  }
  let current: string;
  try {
    current = await realpath(path.resolve(start));
  } catch (error) {
    if (
      hasNodeErrorCode(error, 'ENOENT') ||
      hasNodeErrorCode(error, 'ENOTDIR') ||
      hasNodeErrorCode(error, 'ELOOP')
    ) {
      throw vaultNotFound();
    }
    throw error;
  }
  const startStat = await stat(current);
  if (!startStat.isDirectory()) {
    throw vaultNotFound();
  }

  for (;;) {
    const found = await vaultRootFromCandidate(current);
    if (found !== null) {
      return found;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      throw vaultNotFound();
    }
    current = parent;
  }
}

async function vaultRootFromCandidate(candidate: string): Promise<string | null> {
  let rootStat;
  try {
    rootStat = await lstat(candidate);
  } catch (error) {
    if (hasNodeErrorCode(error, 'ENOENT')) {
      return null;
    }
    throw error;
  }
  if (!rootStat.isDirectory() && !rootStat.isSymbolicLink()) {
    return null;
  }

  let root: string;
  try {
    root = await realpath(candidate);
  } catch (error) {
    if (hasNodeErrorCode(error, 'ENOENT') || hasNodeErrorCode(error, 'ELOOP')) {
      return null;
    }
    throw error;
  }
  const rootDir = await stat(root);
  if (!rootDir.isDirectory()) {
    return null;
  }

  const markerPath = path.join(root, GAVETA_DIRECTORY);
  let markerStat;
  try {
    markerStat = await lstat(markerPath);
  } catch (error) {
    if (hasNodeErrorCode(error, 'ENOENT')) {
      return null;
    }
    throw error;
  }
  if (!markerStat.isDirectory() && !markerStat.isSymbolicLink()) {
    return null;
  }

  let markerReal: string;
  try {
    markerReal = await realpath(markerPath);
  } catch (error) {
    if (hasNodeErrorCode(error, 'ENOENT') || hasNodeErrorCode(error, 'ELOOP')) {
      throw pathOutsideVault();
    }
    throw error;
  }
  if (!isInsideVault(root, markerReal)) {
    throw pathOutsideVault();
  }
  const markerDir = await stat(markerReal);
  if (!markerDir.isDirectory()) {
    return null;
  }
  return root;
}

function isSafePathInput(value: string): boolean {
  return !value.includes('\0');
}
