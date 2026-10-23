import { openVaultIndex, type VaultIndex } from '@gaveta/core';
import { warningFromCode, type ApiWarning } from './envelope.ts';
import type { VaultNoteEvent } from './vault-events.ts';
import { pairMoveEvent } from './vault-move.ts';

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

  async applyFileChange(
    change:
      | { readonly kind: 'change' | 'add' | 'unlink'; readonly relativePath: string }
      | { readonly kind: 'moved'; readonly from: string; readonly to: string },
    recentUnlinks: Map<string, number>,
    movePairWindowMs: number,
  ): Promise<VaultNoteEvent | null> {
    return this.runExclusive(async () => {
      const index = await this.open();
      await ensureIndexed(index);
      if (change.kind === 'moved') {
        recentUnlinks.delete(change.from);
        const id = noteIdForPath(index, change.from);
        await index.remove(change.from);
        await index.upsert(change.to);
        return { type: 'note:moved', path: change.to, id, from: change.from };
      }
      const path = change.relativePath;
      if (change.kind === 'unlink') {
        const id = noteIdForPath(index, path);
        await index.remove(path);
        return { type: 'note:removed', path, id };
      }
      if (change.kind === 'add') {
        const move = pairMoveEvent(path, recentUnlinks, Date.now(), movePairWindowMs);
        if (move !== null) {
          recentUnlinks.delete(move.from);
          const id = noteIdForPath(index, move.from);
          await index.remove(move.from);
          await index.upsert(move.to);
          return { type: 'note:moved', path: move.to, id, from: move.from };
        }
        await index.upsert(path);
        return { type: 'note:added', path, id: noteIdForPath(index, path) };
      }
      await index.upsert(path);
      return { type: 'note:changed', path, id: noteIdForPath(index, path) };
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
