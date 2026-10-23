import { afterEach, describe, expect, it, vi } from 'vitest';
import { VaultEventBus, type VaultNoteEvent } from './vault-events.ts';
import type { VaultIndexSession } from './vault-index.ts';
import { createVaultWatcherCore } from './vault-watcher-core.ts';

describe('createVaultWatcherCore close', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('drops pending work on close and does not emit after close', async () => {
    vi.useFakeTimers();
    const emitted: VaultNoteEvent[] = [];
    const bus = new VaultEventBus();
    bus.onNote((event) => {
      emitted.push(event);
    });

    let resolveApply!: (event: VaultNoteEvent | null) => void;
    const applyFileChange = vi.fn(
      () =>
        new Promise<VaultNoteEvent | null>((resolve) => {
          resolveApply = resolve;
        }),
    );
    const session = { applyFileChange } as unknown as VaultIndexSession;

    const core = createVaultWatcherCore({
      vaultRoot: '/vault',
      session,
      bus,
      debounceMs: 10,
      maxWaitMs: 100,
    });

    core.queue({ kind: 'change', relativePath: 'destino.html' });
    vi.advanceTimersByTime(10);
    await vi.runAllTimersAsync();
    expect(applyFileChange.mock.calls.length).toBeGreaterThan(0);

    const closed = core.close();
    resolveApply({
      type: 'note:changed',
      path: 'destino.html',
      id: '01M5HGV8800000000000000001',
    });
    await closed;
    await vi.runAllTimersAsync();

    expect(emitted).toHaveLength(0);

    core.queue({ kind: 'change', relativePath: 'otro.html' });
    vi.advanceTimersByTime(100);
    await vi.runAllTimersAsync();
    expect(emitted).toHaveLength(0);
  });
});
