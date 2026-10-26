import chokidar, { type FSWatcher } from 'chokidar';
import path from 'node:path';
import type { VaultNoteEvent } from './vault-events.ts';
import {
  isAtomicTempRelativePath,
  isGavetaInternalRelativePath,
  isHtmlNoteRelativePath,
  toVaultRelativePath,
} from './vault-paths.ts';
import type { VaultIndexSession } from './vault-index.ts';
import { markChokidar } from './live-pipeline-trace.ts';
import { createVaultWatcherCore, type VaultWatcherCore } from './vault-watcher-core.ts';

export interface VaultWatcher {
  whenReady(): Promise<void>;
  close(): Promise<void>;
}

export interface CreateVaultWatcherOptions {
  readonly vaultRoot: string;
  readonly session: VaultIndexSession;
  readonly bus: import('./vault-events.ts').VaultEventBus;
  readonly debounceMs?: number;
  readonly maxWaitMs?: number;
  readonly movePairWindowMs?: number;
}

export function createVaultWatcher(options: CreateVaultWatcherOptions): VaultWatcher {
  const core: VaultWatcherCore = createVaultWatcherCore(options);

  let closed = false;

  let resolveReady!: () => void;
  const whenReady = new Promise<void>((resolve) => {
    resolveReady = resolve;
  });

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

  const onPath = (kind: 'change' | 'add' | 'unlink', absolutePath: string): void => {
    if (closed) {
      return;
    }
    const relative = toVaultRelativePath(options.vaultRoot, absolutePath);
    if (relative === null) {
      return;
    }
    markChokidar(relative);
    core.queue({ kind, relativePath: relative });
  };

  watcher.on('ready', () => {
    resolveReady();
  });

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
    whenReady(): Promise<void> {
      return whenReady;
    },
    async close(): Promise<void> {
      closed = true;
      await core.close();
      await watcher.close();
    },
  };
}

export type { VaultNoteEvent };
