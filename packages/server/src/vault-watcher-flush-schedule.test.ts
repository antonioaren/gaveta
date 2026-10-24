import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFlushSchedule } from './vault-watcher-flush-schedule.ts';

describe('createFlushSchedule', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('flushes at least every maxWaitMs when schedule is called more often than debounceMs', () => {
    vi.useFakeTimers();
    const burstToFlushMs: number[] = [];
    let burstStart: number | null = null;
    let flushCount = 0;
    const schedule = createFlushSchedule({
      debounceMs: 50,
      maxWaitMs: 250,
      onFlush: () => {
        if (burstStart !== null) {
          burstToFlushMs.push(Date.now() - burstStart);
          burstStart = null;
        }
        flushCount += 1;
      },
    });

    for (let elapsed = 0; elapsed <= 1_000; elapsed += 30) {
      burstStart ??= Date.now();
      schedule.schedule();
      vi.advanceTimersByTime(30);
    }
    vi.runOnlyPendingTimers();

    expect(flushCount).toBeGreaterThanOrEqual(4);
    for (const delay of burstToFlushMs) {
      expect(delay).toBeLessThanOrEqual(250);
    }

    schedule.dispose();
  });
});
