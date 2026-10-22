import { lstat, mkdir, realpath, rmdir, stat, unlink } from 'node:fs/promises';
import path from 'node:path';
import { GavetaError } from '../errors.ts';
import { inspectVaultPath } from '../links/path.ts';
import type { VaultIndex } from '../sqlite/store.ts';
import { hasNodeErrorCode } from '../vault/node-error.ts';
import { pathOutsideVault } from '../vault/errors.ts';
import { isInsideVault, resolveInsideVault, writeVaultText } from '../vault/paths.ts';

export interface Change {
  readonly path: string;
  /** Null when this change creates the file. */
  readonly before: string | null;
  /** Null when this change deletes the file. */
  readonly after: string | null;
}

/**
 * Apply every change, then update the index. A failed write restores the files
 * already applied. A failed index update restores every change and rebuilds the
 * index from the restored files.
 */
export async function commitNoteChanges(
  index: VaultIndex,
  root: string,
  changes: readonly Change[],
  updateIndex: () => Promise<void>,
): Promise<void> {
  const created = await applyChanges(root, changes);
  try {
    await updateIndex();
  } catch (error) {
    await restoreChanges(root, changes, created);
    try {
      await index.rebuild();
    } catch {
      throw new GavetaError('E_INDEX_CORRUPT');
    }
    throw error;
  }
}

async function applyChanges(root: string, changes: readonly Change[]): Promise<string[]> {
  const created: string[] = [];
  const applied: Change[] = [];
  try {
    for (const change of changes) {
      await applyOne(root, change, created);
      applied.push(change);
    }
  } catch (error) {
    await restoreChanges(root, applied, created);
    throw error;
  }
  return created;
}

async function applyOne(root: string, change: Change, created: string[]): Promise<void> {
  if (change.after !== null) {
    await ensureParent(root, change.path, created);
    await writeVaultText(root, change.path, change.after);
    return;
  }
  await deleteVaultFile(root, change.path);
}

async function restoreChanges(
  root: string,
  applied: readonly Change[],
  created: readonly string[],
): Promise<void> {
  for (let index = applied.length - 1; index >= 0; index -= 1) {
    const change = applied[index];
    if (change === undefined) {
      continue;
    }
    if (change.before === null) {
      await deleteVaultFile(root, change.path);
      continue;
    }
    await ensureParent(root, change.path, []);
    await writeVaultText(root, change.path, change.before);
  }
  for (let index = created.length - 1; index >= 0; index -= 1) {
    const directory = created[index];
    if (directory === undefined) {
      continue;
    }
    try {
      await rmdir(directory);
    } catch (error) {
      if (!hasNodeErrorCode(error, 'ENOTEMPTY') && !hasNodeErrorCode(error, 'ENOENT')) {
        throw error;
      }
    }
  }
}

async function ensureParent(root: string, userPath: string, created: string[]): Promise<void> {
  const inspected = inspectVaultPath(userPath);
  if (!inspected.ok) {
    throw pathOutsideVault();
  }
  const rootReal = await realpath(root);
  let current = rootReal;
  const segments = inspected.path.split('/').slice(0, -1);
  for (const segment of segments) {
    const next = path.join(current, segment);
    const listed = await lstatOrNull(next);
    if (listed === null) {
      await mkdir(next);
      created.push(next);
      current = next;
      continue;
    }
    if (listed.isSymbolicLink()) {
      const real = await realpath(next);
      if (!isInsideVault(rootReal, real)) {
        throw pathOutsideVault();
      }
      const info = await stat(real);
      if (!info.isDirectory()) {
        throw new GavetaError('E_PATH_EXISTS');
      }
      current = real;
      continue;
    }
    if (!listed.isDirectory()) {
      throw new GavetaError('E_PATH_EXISTS');
    }
    current = next;
  }
}

async function deleteVaultFile(root: string, userPath: string): Promise<void> {
  const rootReal = await realpath(root);
  const entry = await resolveInsideVault(rootReal, userPath);
  if (!isInsideVault(rootReal, entry) || entry === rootReal) {
    throw pathOutsideVault();
  }
  const listed = await lstat(entry);
  if (listed.isSymbolicLink()) {
    const real = await realpath(entry);
    if (!isInsideVault(rootReal, real)) {
      throw pathOutsideVault();
    }
    await unlink(entry);
    return;
  }
  if (!listed.isFile()) {
    throw pathOutsideVault();
  }
  await unlink(entry);
}

async function lstatOrNull(target: string): Promise<Awaited<ReturnType<typeof lstat>> | null> {
  try {
    return await lstat(target);
  } catch (error) {
    if (hasNodeErrorCode(error, 'ENOENT')) {
      return null;
    }
    throw error;
  }
}
