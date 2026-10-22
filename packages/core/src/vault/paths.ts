import { constants, type Stats } from 'node:fs';
import { lstat, open, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { writeAtomic } from './atomic.ts';
import { pathOutsideVault, vaultNotFound } from './errors.ts';
import { hasNodeErrorCode } from './node-error.ts';

/**
 * `path.normalize` collapses `..` before symlinks are resolved, so `link/../x`
 * looks inside the vault when `link` points outside. Walk one segment at a time.
 * Ancestor symlinks (macOS `/tmp` → `/private/tmp`) are followed until the walk
 * enters the vault; after that, a symlink or `..` that leaves is rejected.
 */
export function isInsideVault(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return (
    relative === '' ||
    (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))
  );
}

export async function resolveInsideVault(vaultRoot: string, userPath: string): Promise<string> {
  if (!isSafePathInput(vaultRoot) || !isSafePathInput(userPath)) {
    throw pathOutsideVault();
  }
  const root = await realDirectory(vaultRoot);
  const segments = splitSegments(userPath);
  let current = root;
  let entered = true;
  let lexical = false;
  if (path.isAbsolute(userPath)) {
    current = await realOrThrow(path.parse(userPath).root);
    entered = isInsideVault(root, current);
  }

  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    if (segment === undefined) {
      continue;
    }
    const isLast = index === segments.length - 1;
    if (segment === '..') {
      const parent = path.dirname(current);
      if (entered && !isInsideVault(root, parent)) {
        throw pathOutsideVault();
      }
      current = parent;
      entered = isInsideVault(root, current);
      continue;
    }
    if (lexical) {
      const next = path.join(current, segment);
      if (entered && !isInsideVault(root, next)) {
        throw pathOutsideVault();
      }
      current = next;
      entered = isInsideVault(root, current);
      continue;
    }

    const next = path.join(current, segment);
    const listed = await lstatOrNull(next);
    if (listed === null) {
      if (entered && !isInsideVault(root, next)) {
        throw pathOutsideVault();
      }
      lexical = true;
      current = next;
      entered = isInsideVault(root, current);
      continue;
    }
    if (listed.isSymbolicLink()) {
      const resolved = await followLink(root, next, isLast, entered);
      current = resolved.current;
      entered = resolved.entered;
      continue;
    }
    if (!isLast && !listed.isDirectory()) {
      throw pathOutsideVault();
    }
    const real = await realOrThrow(next);
    if (entered && !isInsideVault(root, real)) {
      throw pathOutsideVault();
    }
    current = real;
    entered = isInsideVault(root, current);
  }

  if (!isInsideVault(root, current)) {
    throw pathOutsideVault();
  }
  return current;
}

export async function readVaultText(vaultRoot: string, userPath: string): Promise<string> {
  const entry = await resolveInsideVault(vaultRoot, userPath);
  const root = await realDirectory(vaultRoot);
  const listed = await lstat(entry);
  const filePath = await readableFile(root, entry, listed);
  return readFileNoFollow(filePath);
}

export async function writeVaultText(
  vaultRoot: string,
  userPath: string,
  contents: string,
): Promise<void> {
  const entry = await resolveInsideVault(vaultRoot, userPath);
  const root = await realDirectory(vaultRoot);
  if (!isInsideVault(root, entry) || entry === root) {
    throw pathOutsideVault();
  }
  const parent = path.dirname(entry);
  if (!isInsideVault(root, parent)) {
    throw pathOutsideVault();
  }
  const parentReal = await realpath(parent);
  if (!isInsideVault(root, parentReal)) {
    throw pathOutsideVault();
  }
  await assertWritableEntry(root, entry);
  await writeAtomic(entry, contents);
}

function isSafePathInput(value: string): boolean {
  return !value.includes('\0');
}

function splitSegments(userPath: string): string[] {
  let body = userPath;
  if (path.isAbsolute(userPath)) {
    body = userPath.slice(path.parse(userPath).root.length);
  }
  if (path.sep === '\\') {
    body = body.replaceAll('\\', '/');
  }
  return body.split('/').filter((segment) => segment !== '' && segment !== '.');
}

async function realDirectory(vaultRoot: string): Promise<string> {
  let root: string;
  try {
    root = await realpath(vaultRoot);
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
  const info = await stat(root);
  if (!info.isDirectory()) {
    throw vaultNotFound();
  }
  return root;
}

async function realOrThrow(target: string): Promise<string> {
  try {
    return await realpath(target);
  } catch (error) {
    if (
      hasNodeErrorCode(error, 'ENOENT') ||
      hasNodeErrorCode(error, 'ELOOP') ||
      hasNodeErrorCode(error, 'ENOTDIR')
    ) {
      throw pathOutsideVault();
    }
    throw error;
  }
}

async function lstatOrNull(target: string): Promise<Stats | null> {
  try {
    return await lstat(target);
  } catch (error) {
    if (hasNodeErrorCode(error, 'ENOENT')) {
      return null;
    }
    if (hasNodeErrorCode(error, 'ENOTDIR') || hasNodeErrorCode(error, 'ELOOP')) {
      throw pathOutsideVault();
    }
    throw error;
  }
}

async function followLink(
  root: string,
  linkPath: string,
  isLast: boolean,
  entered: boolean,
): Promise<{ current: string; entered: boolean }> {
  const real = await realOrThrow(linkPath);
  const targetInside = isInsideVault(root, real);
  if (entered && !targetInside) {
    throw pathOutsideVault();
  }
  if (!isLast) {
    const targetStat = await stat(real);
    if (!targetStat.isDirectory()) {
      throw pathOutsideVault();
    }
    return { current: real, entered: targetInside };
  }
  if (targetInside) {
    return { current: linkPath, entered: true };
  }
  return { current: real, entered: false };
}

async function readableFile(root: string, entry: string, listed: Stats): Promise<string> {
  if (listed.isSymbolicLink()) {
    const real = await realOrThrow(entry);
    if (!isInsideVault(root, real)) {
      throw pathOutsideVault();
    }
    const target = await stat(real);
    if (!target.isFile()) {
      throw pathOutsideVault();
    }
    return real;
  }
  if (!listed.isFile()) {
    throw pathOutsideVault();
  }
  return entry;
}

async function readFileNoFollow(filePath: string): Promise<string> {
  let handle;
  try {
    handle = await open(filePath, constants.O_RDONLY | constants.O_NOFOLLOW);
  } catch (error) {
    if (hasNodeErrorCode(error, 'ELOOP') || hasNodeErrorCode(error, 'EISDIR')) {
      throw pathOutsideVault();
    }
    throw error;
  }
  try {
    const info = await handle.stat();
    if (!info.isFile()) {
      throw pathOutsideVault();
    }
    return await handle.readFile({ encoding: 'utf8' });
  } finally {
    await handle.close();
  }
}

async function assertWritableEntry(root: string, entry: string): Promise<void> {
  const listed = await lstatOrNull(entry);
  if (listed === null) {
    return;
  }
  if (listed.isSymbolicLink()) {
    const real = await realOrThrow(entry);
    if (!isInsideVault(root, real)) {
      throw pathOutsideVault();
    }
    const target = await stat(real);
    if (!target.isFile()) {
      throw pathOutsideVault();
    }
    return;
  }
  if (!listed.isFile()) {
    throw pathOutsideVault();
  }
}
