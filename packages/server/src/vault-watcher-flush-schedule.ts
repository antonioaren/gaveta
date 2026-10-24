export interface FlushScheduleHandle {
  schedule(): void;
  dispose(): void;
}

export interface CreateFlushScheduleOptions {
  readonly debounceMs: number;
  readonly maxWaitMs: number;
  readonly onFlush: () => void | Promise<void>;
}

/**
 * Trailing debounce with a max-wait cap from the first {@link schedule} in a burst.
 * Prevents indefinite postponement when events arrive faster than debounceMs.
 */
export function createFlushSchedule(options: CreateFlushScheduleOptions): FlushScheduleHandle {
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let maxWaitTimer: ReturnType<typeof setTimeout> | null = null;
  let inBurst = false;

  const clearDebounce = (): void => {
    if (debounceTimer !== null) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
  };

  const clearMaxWait = (): void => {
    if (maxWaitTimer !== null) {
      clearTimeout(maxWaitTimer);
      maxWaitTimer = null;
    }
  };

  const endBurst = (): void => {
    inBurst = false;
    clearDebounce();
    clearMaxWait();
  };

  const runFlush = (): void => {
    endBurst();
    void options.onFlush();
  };

  return {
    schedule(): void {
      if (!inBurst) {
        inBurst = true;
        maxWaitTimer = setTimeout(runFlush, options.maxWaitMs);
      }
      clearDebounce();
      debounceTimer = setTimeout(runFlush, options.debounceMs);
    },
    dispose(): void {
      endBurst();
    },
  };
}
