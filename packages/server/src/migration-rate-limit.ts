import { GavetaError } from '@gaveta/core';

const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 40;

const buckets = new Map<string, number[]>();

/** Simple per-session sliding window limiter for migration routes (CodeQL). */
export function assertMigrationRateLimit(bucketKey: string): void {
  const now = Date.now();
  const previous = buckets.get(bucketKey) ?? [];
  const active = previous.filter((stamp) => now - stamp < WINDOW_MS);
  if (active.length >= MAX_REQUESTS_PER_WINDOW) {
    throw new GavetaError('E_ARG_INVALID');
  }
  active.push(now);
  buckets.set(bucketKey, active);
}

export function resetMigrationRateLimitForTests(): void {
  buckets.clear();
}
