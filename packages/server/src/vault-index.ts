import { access } from 'node:fs/promises';
import nodePath from 'node:path';
import { openVaultIndex, scanNoteFiles, type VaultIndex } from '@gaveta/core';
import { warningFromCode, type ApiWarning } from './envelope.ts';
import type { VaultNoteEvent } from './vault-events.ts';
import { readNoteUlidFromVaultFile } from './vault-note-id.ts';
import { pairMoveByNoteId, type RecentUnlink } from './vault-move.ts';

export class VaultIndexSession {
  private index: VaultIndex | null = null;
  private readonly vaultRoot: string;
  private serial: Promise<void> = Promise.resolve();

  constructor(vaultRoot: string) {
    this.vaultRoot = vaultRoot;
  }

  async withIndex<T>(
    run: (index: VaultIndex) => Promise<T>,
  ): Promise<{ result: T; warnings: ApiWarning[] }> {
    return this.runExclusive(async () => {
      const index = await this.open();
      const warnings = await ensureIndexed(index);
      const result = await run(index);
      return { result, warnings };
    });
  }

  async peekNoteId(relativePath: string): Promise<string | null> {
    return this.runExclusive(async () => {
      const index = await this.open();
      await ensureIndexed(index);
      return noteIdForPath(index, relativePath);
    });
  }

  async applyFileChange(
    change:
      | { readonly kind: 'change' | 'add' | 'unlink'; readonly relativePath: string }
      | { readonly kind: 'moved'; readonly from: string; readonly to: string },
    recentUnlinks: Map<string, RecentUnlink>,
    recentAdds: Map<string, RecentUnlink>,
    movePairWindowMs: number,
  ): Promise<VaultNoteEvent | null> {
    return this.runExclusive(async () => {
      const index = await this.open();
      await ensureIndexed(index);
      const now = Date.now();
      if (change.kind === 'moved') {
        recentUnlinks.delete(change.from);
        recentAdds.delete(change.to);
        const id =
          noteIdForPath(index, change.from) ??
          (await readNoteUlidFromVaultFile(this.vaultRoot, change.to));
        await index.remove(change.from);
        await index.upsert(change.to);
        return {
          type: 'note:moved',
          path: change.to,
          id: noteIdForPath(index, change.to) ?? id,
          from: change.from,
        };
      }
      const relativePath = change.relativePath;
      if (change.kind === 'unlink') {
        const id = noteIdForPath(index, relativePath);
        const to = await resolveMoveDestinationForUnlink(
          this.vaultRoot,
          id,
          relativePath,
          recentAdds,
          now,
          movePairWindowMs,
        );
        if (to !== null) {
          recentAdds.delete(to);
          recentUnlinks.delete(relativePath);
          await index.remove(relativePath);
          const movedId = id ?? noteIdForPath(index, to);
          return { type: 'note:moved', path: to, id: movedId, from: relativePath };
        }
        recentUnlinks.set(relativePath, { id, at: now });
        await index.remove(relativePath);
        return { type: 'note:removed', path: relativePath, id };
      }
      if (change.kind === 'add') {
        const wasIndexed = noteIdForPath(index, relativePath) !== null;
        await index.upsert(relativePath);
        const id = noteIdForPath(index, relativePath);
        const from =
          pairMoveByNoteId(id, recentUnlinks, now, movePairWindowMs, relativePath) ??
          (await indexedPathWithNoteIdMissingFile(index, this.vaultRoot, id, relativePath));
        if (from !== null) {
          recentUnlinks.delete(from);
          recentAdds.delete(relativePath);
          if (noteIdForPath(index, from) !== null) {
            await index.remove(from);
          }
          return { type: 'note:moved', path: relativePath, id, from };
        }
        recentAdds.set(relativePath, { id, at: now });
        if (wasIndexed) {
          return { type: 'note:changed', path: relativePath, id };
        }
        return { type: 'note:added', path: relativePath, id };
      }
      if (!(await vaultNoteFileExists(this.vaultRoot, relativePath))) {
        const id = noteIdForPath(index, relativePath);
        const to = await resolveMoveDestinationForUnlink(
          this.vaultRoot,
          id,
          relativePath,
          recentAdds,
          now,
          movePairWindowMs,
        );
        if (to !== null) {
          recentAdds.delete(to);
          recentUnlinks.delete(relativePath);
          await index.remove(relativePath);
          const movedId = id ?? noteIdForPath(index, to);
          return { type: 'note:moved', path: to, id: movedId, from: relativePath };
        }
        if (id !== null) {
          recentUnlinks.set(relativePath, { id, at: now });
          await index.remove(relativePath);
          return { type: 'note:removed', path: relativePath, id };
        }
        return null;
      }
      await index.upsert(relativePath);
      const id = noteIdForPath(index, relativePath);
      const from = await indexedPathWithNoteIdMissingFile(index, this.vaultRoot, id, relativePath);
      if (from !== null) {
        recentUnlinks.delete(from);
        recentAdds.delete(relativePath);
        await index.remove(from);
        return { type: 'note:moved', path: relativePath, id, from };
      }
      return { type: 'note:changed', path: relativePath, id };
    });
  }

  close(): void {
    if (this.index !== null) {
      this.index.close();
      this.index = null;
    }
  }

  private async open(): Promise<VaultIndex> {
    this.index ??= await openVaultIndex(this.vaultRoot);
    return this.index;
  }

  private async runExclusive<T>(run: () => Promise<T>): Promise<T> {
    const previous = this.serial;
    let release!: () => void;
    this.serial = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await run();
    } finally {
      release();
    }
  }
}

function noteIdForPath(index: VaultIndex, notePath: string): string | null {
  for (const note of index.notes()) {
    if (note.path === notePath) {
      return note.id;
    }
  }
  return null;
}

/** Indexed path with the same id whose note file is already gone (rename source). */
async function indexedPathWithNoteIdMissingFile(
  index: VaultIndex,
  vaultRoot: string,
  noteId: string | null,
  exceptPath: string,
): Promise<string | null> {
  if (noteId === null) {
    return null;
  }
  for (const note of index.notes()) {
    if (note.id === noteId && note.path !== exceptPath) {
      if (!(await vaultNoteFileExists(vaultRoot, note.path))) {
        return note.path;
      }
    }
  }
  return null;
}

async function resolveMoveDestinationForUnlink(
  vaultRoot: string,
  id: string | null,
  relativePath: string,
  recentAdds: ReadonlyMap<string, RecentUnlink>,
  now: number,
  movePairWindowMs: number,
): Promise<string | null> {
  const fromRecent =
    pairMoveByNoteId(id, recentAdds, now, movePairWindowMs, relativePath) ??
    (await recentAddPathWithNoteFile(vaultRoot, id, relativePath, recentAdds));
  if (fromRecent !== null) {
    return fromRecent;
  }
  if (id === null || (await vaultNoteFileExists(vaultRoot, relativePath))) {
    return null;
  }
  return await vaultPathWithSameNoteIdAndBasename(vaultRoot, id, relativePath);
}

async function recentAddPathWithNoteFile(
  vaultRoot: string,
  noteId: string | null,
  exceptPath: string,
  recentAdds: ReadonlyMap<string, RecentUnlink>,
): Promise<string | null> {
  if (noteId === null) {
    return null;
  }
  for (const [addPath, meta] of recentAdds) {
    if (
      addPath !== exceptPath &&
      meta.id === noteId &&
      (await vaultNoteFileExists(vaultRoot, addPath))
    ) {
      return addPath;
    }
  }
  return null;
}

async function vaultPathWithSameNoteIdAndBasename(
  vaultRoot: string,
  noteId: string,
  unlinkedPath: string,
): Promise<string | null> {
  const basename = nodePath.posix.basename(unlinkedPath);
  const scanned = await scanNoteFiles(vaultRoot);
  const matches: string[] = [];
  for (const file of scanned.files) {
    if (file.relativePath === unlinkedPath) {
      continue;
    }
    if (nodePath.posix.basename(file.relativePath) !== basename) {
      continue;
    }
    const fileId = await readNoteUlidFromVaultFile(vaultRoot, file.relativePath);
    if (fileId === noteId) {
      matches.push(file.relativePath);
    }
  }
  if (matches.length !== 1) {
    return null;
  }
  const match = matches[0];
  return match ?? null;
}

async function vaultNoteFileExists(vaultRoot: string, relativePath: string): Promise<boolean> {
  try {
    await access(nodePath.join(vaultRoot, relativePath));
    return true;
  } catch {
    return false;
  }
}

async function ensureIndexed(index: VaultIndex): Promise<ApiWarning[]> {
  const recovered = index.recovery();
  if (recovered !== null || index.notes().length === 0) {
    await index.rebuild();
  }
  if (recovered === null) {
    return [];
  }
  return [warningFromCode('W_INDEX_RECOVERED')];
}
