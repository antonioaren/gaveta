import { expect, it } from 'vitest';
import { isUlid } from './contract.ts';
import { createUlid } from './ulid.ts';

const entropy = Uint8Array.from({ length: 10 }, (_, index) => index + 1);

it('builds a stable, sortable Crockford ULID', () => {
  const early = createUlid(1_700_000_000_000, entropy);
  const later = createUlid(1_700_000_000_001, entropy);
  expect(early).toHaveLength(26);
  expect(isUlid(early)).toBe(true);
  expect(isUlid(later)).toBe(true);
  expect(early < later).toBe(true);
  expect(createUlid(1_700_000_000_000, entropy)).toBe(early);
  const other = Uint8Array.from({ length: 10 }, () => 31);
  expect(createUlid(1_700_000_000_000, other)).not.toBe(early);
});

it('draws fresh entropy when the caller does not pass any', () => {
  const first = createUlid(1_700_000_000_000);
  const second = createUlid(1_700_000_000_000);
  expect(isUlid(first)).toBe(true);
  expect(first).not.toBe(second);
});
