import { lstat, mkdir, realpath, rename, rmdir } from 'node:fs/promises';
import path from 'node:path';
import { GavetaError } from '../errors.ts';
import { notePathInFolder } from '../graph.ts';
import { inspectVaultPath } from '../links/path.ts';
import type { IndexedNote, VaultIndex } from '../sqlite/store.ts';
import { hasNodeErrorCode } from '../vault/node-error.ts';
import { pathOutsideVault } from '../vault/errors.ts';
import { isInsideVault, resolveInsideVault, readVaultText } from '../vault/paths.ts';
import { commitNoteChanges, type Change } from './commit.ts';
import { convertToPending, retargetIncoming, retargetMoved } from './edit.ts';
import { GavetaOperationError } from './error.ts';
import { assertFolderMoveAllowed, normalizeVaultFolder, remapNotePath } from './folder-path.ts';
import { incomingLinks } from './incoming.ts';
import { rootOf } from './move.ts';
import type { AffectedNote } from './types.ts';

export interface MoveFolderResult {
  readonly from: string;
  readonly to: string;
  readonly moved: readonly {
    readonly from: string;
    readonly to: string;
    readonly id: string | null;
  }[];
  readonly rewritten: readonly string[];
}

export interface RemoveFolderResult {
  readonly folder: string;
  readonly removed: readonly string[];
  readonly forced: boolean;
  readonly pending: readonly string[];
}

export async function moveFolder(
  index: VaultIndex,
  folder: string,
  destination: string,
): Promise<MoveFolderResult> {
  const root = rootOf(index);
  const from = normalizeVaultFolder(folder);
  const to = normalizeVaultFolder(destination);
  assertFolderMoveAllowed(from, to);

  const notes = listNotesInFolder(index, from);
  if (notes.length === 0) {
    await renameVaultDirectory(root, from, to);
    return { from, to, moved: [], rewritten: [] };
  }

  const pathMap = new Map<string, string>();
  for (const note of notes) {
    pathMap.set(note.path, remapNotePath(note.path, from, to));
  }
  for (const dest of pathMap.values()) {
    await assertDestinationFree(root, dest);
  }

  const movedSet = new Set(pathMap.keys());
  const changes: Change[] = [];
  const rewritten = new Set<string>();
  const htmlEdits = new Map<string, string>();

  async function htmlAt(notePath: string): Promise<string> {
    const cached = htmlEdits.get(notePath);
    if (cached !== undefined) {
      return cached;
    }
    const loaded = await readVaultText(root, notePath);
    htmlEdits.set(notePath, loaded);
    return loaded;
  }

  for (const note of notes) {
    if (note.id === null) {
      continue;
    }
    const toPath = pathMap.get(note.path);
    if (toPath === undefined) {
      throw new GavetaError('E_HTML_INVALID');
    }
    const incoming = incomingLinks(index, note.path);
    for (const source of incoming.notes) {
      if (source.path === note.path) {
        continue;
      }
      if (movedSet.has(source.path)) {
        continue;
      }
      const html = await htmlAt(source.path);
      const edited = retargetIncoming(html, source.path, note.id, toPath);
      const expected = incoming.counts.get(source.path) ?? 0;
      if (edited.anchors < expected) {
        throw new GavetaError('E_HTML_INVALID');
      }
      if (edited.html !== html) {
        htmlEdits.set(source.path, edited.html);
        rewritten.add(source.path);
      }
    }
  }

  const moved: { from: string; to: string; id: string | null }[] = [];
  for (const note of notes) {
    const toPath = pathMap.get(note.path);
    if (toPath === undefined) {
      throw new GavetaError('E_HTML_INVALID');
    }
    const original = await readVaultText(root, note.path);
    const retargeted = retargetMoved(original, note.path, toPath, note.id, index);
    const selfIncoming = incomingLinks(index, note.path).counts.get(note.path) ?? 0;
    if (retargeted.anchors < selfIncoming) {
      throw new GavetaError('E_HTML_INVALID');
    }
    changes.push({ path: toPath, before: null, after: retargeted.html });
    changes.push({ path: note.path, before: original, after: null });
    moved.push({ from: note.path, to: toPath, id: note.id });
  }

  for (const sourcePath of rewritten) {
    const before = await readVaultText(root, sourcePath);
    const after = htmlEdits.get(sourcePath);
    if (after !== undefined && after !== before) {
      changes.push({ path: sourcePath, before, after });
    }
  }

  await commitNoteChanges(index, root, changes, async () => {
    for (const note of notes) {
      await index.remove(note.path);
    }
    for (const dest of pathMap.values()) {
      await index.upsert(dest);
    }
    for (const sourcePath of rewritten) {
      await index.upsert(sourcePath);
    }
  });

  await removeEmptyDirectories(root, from);

  return {
    from,
    to,
    moved,
    rewritten: [...rewritten].sort((left, right) => (left < right ? -1 : left > right ? 1 : 0)),
  };
}

export async function removeFolder(
  index: VaultIndex,
  folder: string,
  options?: unknown,
): Promise<RemoveFolderResult> {
  const force = readForce(options);
  const root = rootOf(index);
  const normalized = normalizeVaultFolder(folder);
  const notes = listNotesInFolder(index, normalized);
  const affected = collectIncoming(index, notes);
  if (affected.length > 0 && !force) {
    throw new GavetaOperationError('E_HAS_BACKLINKS', {}, { affected });
  }

  const changes: Change[] = [];
  const pending = new Set<string>();
  const removed: string[] = [];
  const htmlEdits = new Map<string, string>();

  async function htmlAt(notePath: string): Promise<string> {
    const cached = htmlEdits.get(notePath);
    if (cached !== undefined) {
      return cached;
    }
    const loaded = await readVaultText(root, notePath);
    htmlEdits.set(notePath, loaded);
    return loaded;
  }

  for (const note of notes) {
    if (force && note.id !== null) {
      const incoming = incomingLinks(index, note.path);
      for (const source of incoming.notes) {
        if (source.path === note.path) {
          continue;
        }
        const html = await htmlAt(source.path);
        const edited = convertToPending(html, note.id, note.title);
        const expected = incoming.counts.get(source.path) ?? 0;
        if (edited.anchors < expected) {
          throw new GavetaError('E_HTML_INVALID');
        }
        if (edited.html !== html) {
          htmlEdits.set(source.path, edited.html);
          pending.add(source.path);
        }
      }
    }
    const original = await readVaultText(root, note.path);
    changes.push({ path: note.path, before: original, after: null });
    removed.push(note.path);
  }

  for (const sourcePath of pending) {
    const before = await readVaultText(root, sourcePath);
    const after = htmlEdits.get(sourcePath);
    if (after !== undefined && after !== before) {
      changes.push({ path: sourcePath, before, after });
    }
  }

  await commitNoteChanges(index, root, changes, async () => {
    for (const sourcePath of pending) {
      await index.upsert(sourcePath);
    }
    for (const notePath of removed) {
      await index.remove(notePath);
    }
  });

  await removeEmptyDirectories(root, normalized);

  return {
    folder: normalized,
    removed,
    forced: force,
    pending: [...pending].sort((left, right) => (left < right ? -1 : left > right ? 1 : 0)),
  };
}

function listNotesInFolder(index: VaultIndex, folder: string): readonly IndexedNote[] {
  return index
    .notes()
    .filter((note) => notePathInFolder(note.path, folder))
    .sort((left, right) => right.path.length - left.path.length);
}

function collectIncoming(
  index: VaultIndex,
  notes: readonly { readonly path: string }[],
): readonly AffectedNote[] {
  const seen = new Set<string>();
  const affected: AffectedNote[] = [];
  for (const note of notes) {
    const incoming = incomingLinks(index, note.path);
    for (const source of incoming.notes) {
      if (notes.some((candidate) => candidate.path === source.path)) {
        continue;
      }
      if (seen.has(source.path)) {
        continue;
      }
      seen.add(source.path);
      affected.push(source);
    }
  }
  return affected;
}

function readForce(options: unknown): boolean {
  if (options === undefined) {
    return false;
  }
  if (options === null || typeof options !== 'object' || Array.isArray(options)) {
    throw new GavetaError('E_ARG_INVALID');
  }
  const record = options as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (key !== 'force') {
      throw new GavetaError('E_ARG_INVALID');
    }
  }
  if (!Object.hasOwn(record, 'force')) {
    return false;
  }
  if (record.force !== true && record.force !== false) {
    throw new GavetaError('E_ARG_INVALID');
  }
  return record.force;
}

async function assertDestinationFree(root: string, notePath: string): Promise<void> {
  try {
    await lstat(await resolveInsideVault(root, notePath));
  } catch (error) {
    if (hasNodeErrorCode(error, 'ENOENT')) {
      return;
    }
    throw error;
  }
  throw new GavetaError('E_PATH_EXISTS');
}

async function renameVaultDirectory(root: string, from: string, to: string): Promise<void> {
  const fromAbs = await resolveInsideVault(root, from);
  const toAbs = await resolveInsideVault(root, to);
  try {
    await lstat(fromAbs);
  } catch (error) {
    if (hasNodeErrorCode(error, 'ENOENT')) {
      throw new GavetaError('E_REF_NOT_FOUND');
    }
    throw error;
  }
  try {
    await lstat(toAbs);
    throw new GavetaError('E_PATH_EXISTS');
  } catch (error) {
    if (!hasNodeErrorCode(error, 'ENOENT')) {
      throw error;
    }
  }
  await mkdir(path.dirname(toAbs), { recursive: true });
  await rename(fromAbs, toAbs);
}

async function removeEmptyDirectories(root: string, folder: string): Promise<void> {
  const rootReal = await realpath(root);
  const segments = folder.split('/');
  for (let depth = segments.length; depth > 0; depth -= 1) {
    const relative = segments.slice(0, depth).join('/');
    const absolute = await resolveInsideVault(rootReal, relative);
    if (!isInsideVault(rootReal, absolute) || absolute === rootReal) {
      break;
    }
    try {
      await rmdir(absolute);
    } catch (error) {
      if (hasNodeErrorCode(error, 'ENOTEMPTY') || hasNodeErrorCode(error, 'ENOENT')) {
        break;
      }
      throw error;
    }
  }
}

export async function createVaultFolder(vaultRoot: string, folder: string): Promise<string> {
  const normalized = normalizeVaultFolder(folder);
  const segments = normalized.split('/');
  let prefix = '';
  for (const segment of segments) {
    prefix = prefix.length === 0 ? segment : `${prefix}/${segment}`;
    const inspected = inspectVaultPath(prefix);
    if (!inspected.ok) {
      throw pathOutsideVault();
    }
    const absolute = await resolveInsideVault(vaultRoot, prefix);
    let listed: Awaited<ReturnType<typeof lstat>> | null = null;
    try {
      listed = await lstat(absolute);
    } catch (error) {
      if (!hasNodeErrorCode(error, 'ENOENT')) {
        throw error;
      }
    }
    if (listed === null) {
      await mkdir(absolute);
      continue;
    }
    if (listed.isSymbolicLink()) {
      throw new GavetaError('E_PATH_OUTSIDE_VAULT');
    }
    if (!listed.isDirectory()) {
      throw new GavetaError('E_PATH_EXISTS');
    }
  }
  return normalized;
}
