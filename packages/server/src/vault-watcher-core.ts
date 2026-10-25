import { performance } from 'node:perf_hooks';
import type { VaultEventBus, VaultNoteEvent } from './vault-events.ts';
import {
  coalesceMovesByNoteId,
  coalescePendingChanges,
  mergePendingFileEvent,
} from './vault-batch.ts';
import type { RecentUnlink } from './vault-move.ts';
import { shouldIndexVaultRelativePath } from './vault-paths.ts';
import type { VaultIndexSession } from './vault-index.ts';
import { markDebounceFlush, markIndexUpdated, takePipelineTrace } from './live-pipeline-trace.ts';
import { createFlushSchedule } from './vault-watcher-flush-schedule.ts';

export interface VaultWatcherCore {
  queue(change: PendingChange): void;
  close(): Promise<void>;
}

export interface CreateVaultWatcherCoreOptions {
  readonly vaultRoot: string;
  readonly session: VaultIndexSession;
  readonly bus: VaultEventBus;
  readonly debounceMs?: number;
  readonly maxWaitMs?: number;
  readonly movePairWindowMs?: number;
}

type PendingChange = import('./vault-batch.ts').PendingFileEvent;

/** macOS FSEvents can deliver unlink/add seconds apart; keep pairing longer than debounce bursts. */
const DEFAULT_MOVE_PAIR_WINDOW_MS = 3_000;

export function createVaultWatcherCore(options: CreateVaultWatcherCoreOptions): VaultWatcherCore {
  const debounceMs = options.debounceMs ?? 50;
  const maxWaitMs = options.maxWaitMs ?? 250;
  const movePairWindowMs = options.movePairWindowMs ?? DEFAULT_MOVE_PAIR_WINDOW_MS;
  const pending = new Map<string, PendingChange>();
  const recentUnlinks = new Map<string, RecentUnlink>();
  const lifecycle = { closed: false };
  let flushEpoch = 0;

  const flushPending = async (): Promise<void> => {
    if (lifecycle.closed) {
      pending.clear();
      return;
    }
    if (pending.size === 0) {
      return;
    }
    const epoch = flushEpoch;
    try {
      const deduped = coalescePendingChanges([...pending.values()]);
      pending.clear();
      const flushAt = performance.now();
      for (const change of deduped) {
        if (change.kind === 'change' || change.kind === 'add' || change.kind === 'unlink') {
          markDebounceFlush(change.relativePath, flushAt);
        }
      }
      const batch = await coalesceMovesByNoteId(deduped, options.vaultRoot, options.session);
      if (epoch !== flushEpoch) {
        return;
      }
      for (const change of batch) {
        const event = await options.session.applyFileChange(
          change,
          recentUnlinks,
          movePairWindowMs,
        );
        if (epoch !== flushEpoch) {
          return;
        }
        if (event !== null) {
          markIndexUpdated(event.path, performance.now());
          const pipeline = takePipelineTrace(event.path, performance.now());
          options.bus.emitNote(pipeline === undefined ? event : { ...event, pipeline });
        }
      }
    } catch {
      if (epoch !== flushEpoch) {
        return;
      }
      throw new Error('E_VAULT_WATCHER_FLUSH_FAILED');
    }
  };

  const flushSchedule = createFlushSchedule({
    debounceMs,
    maxWaitMs,
    onFlush: () => {
      void flushPending().catch(() => {
        /* superseded or closed; avoid unhandled rejections in tests */
      });
    },
  });

  return {
    queue(change: PendingChange): void {
      if (lifecycle.closed) {
        return;
      }
      if (!shouldIndexVaultRelativePath(change.relativePath)) {
        return;
      }
      pending.set(
        change.relativePath,
        mergePendingFileEvent(pending.get(change.relativePath), change),
      );
      flushSchedule.schedule();
    },
    close(): Promise<void> {
      lifecycle.closed = true;
      flushEpoch += 1;
      flushSchedule.dispose();
      pending.clear();
      return Promise.resolve();
    },
  };
}

export type { VaultNoteEvent };
