import chokidar, { type FSWatcher } from 'chokidar';
import path from 'node:path';
import type { VaultEventBus, VaultNoteEvent } from './vault-events.ts';
import { coalescePendingChanges } from './vault-batch.ts';
import {
  isAtomicTempRelativePath,
  isGavetaInternalRelativePath,
  isHtmlNoteRelativePath,
  shouldIndexVaultRelativePath,
  toVaultRelativePath,
} from './vault-paths.ts';
import type { VaultIndexSession } from './vault-index.ts';

export interface VaultWatcher {
  close(): Promise<void>;
}

export interface CreateVaultWatcherOptions {
  readonly vaultRoot: string;
  readonly session: VaultIndexSession;
  readonly bus: VaultEventBus;
  readonly debounceMs?: number;
  readonly movePairWindowMs?: number;
}

interface PendingChange {
  readonly kind: 'change' | 'add' | 'unlink';
  readonly relativePath: string;
}

export function createVaultWatcher(options: CreateVaultWatcherOptions): VaultWatcher {
  const debounceMs = options.debounceMs ?? 75;
  const movePairWindowMs = options.movePairWindowMs ?? 200;
  const pending = new Map<string, PendingChange>();
  const recentUnlinks = new Map<string, number>();
  let flushTimer: ReturnType<typeof setTimeout> | null = null;
  let closed = false;

  const scheduleFlush = (): void => {
    if (flushTimer !== null) {
      return;
    }
    flushTimer = setTimeout(() => {
      flushTimer = null;
      void flushPending();
    }, debounceMs);
  };

  const flushPending = async (): Promise<void> => {
    if (pending.size === 0) {
      return;
    }
    const batch = coalescePendingChanges([...pending.values()]);
    pending.clear();
    for (const change of batch) {
      const event = await options.session.applyFileChange(change, recentUnlinks, movePairWindowMs);
      if (event !== null) {
        options.bus.emitNote(event);
      }
    }
  };

  const queue = (change: PendingChange): void => {
    if (!shouldIndexVaultRelativePath(change.relativePath)) {
      return;
    }
    pending.set(change.relativePath, change);
    scheduleFlush();
  };

  const watcher: FSWatcher = chokidar.watch(options.vaultRoot, {
    ignoreInitial: true,
    awaitWriteFinish: {
      stabilityThreshold: 50,
      pollInterval: 25,
    },
    ignored: (absolutePath) => {
      const relative = toVaultRelativePath(options.vaultRoot, absolutePath);
      if (relative === null) {
        return true;
      }
      if (isGavetaInternalRelativePath(relative)) {
        return true;
      }
      if (isAtomicTempRelativePath(relative)) {
        return true;
      }
      if (isHtmlNoteRelativePath(relative)) {
        return false;
      }
      const base = path.basename(relative);
      if (!base.includes('.')) {
        return false;
      }
      return true;
    },
  });

  const onPath = (kind: PendingChange['kind'], absolutePath: string): void => {
    if (closed) {
      return;
    }
    const relative = toVaultRelativePath(options.vaultRoot, absolutePath);
    if (relative === null) {
      return;
    }
    if (kind === 'unlink') {
      recentUnlinks.set(relative, Date.now());
    }
    queue({ kind, relativePath: relative });
  };

  watcher.on('change', (absolutePath) => {
    onPath('change', absolutePath);
  });
  watcher.on('add', (absolutePath) => {
    onPath('add', absolutePath);
  });
  watcher.on('unlink', (absolutePath) => {
    onPath('unlink', absolutePath);
  });

  return {
    async close(): Promise<void> {
      closed = true;
      if (flushTimer !== null) {
        clearTimeout(flushTimer);
        flushTimer = null;
      }
      await watcher.close();
      await flushPending();
    },
  };
}

export type { VaultNoteEvent };
