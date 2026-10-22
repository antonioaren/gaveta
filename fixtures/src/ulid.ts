import { CREATED_MS } from './constants.ts';

/** Crockford base32. I, L, O, and U are excluded so ids are not confused with digits. */
export const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export const ULID_PATTERN = /^[0-9A-HJKMNP-TV-Z]{26}$/;

export function encodeCrockford(value: number, chars: number): string {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error('value must be a non-negative integer');
  }
  let rest = value;
  let encoded = '';
  for (let index = 0; index < chars; index += 1) {
    const digit = CROCKFORD[rest % 32];
    if (digit === undefined) {
      throw new Error('Crockford alphabet is incomplete');
    }
    encoded = digit + encoded;
    rest = Math.floor(rest / 32);
  }
  if (rest !== 0) {
    throw new Error('value does not fit in the allotted characters');
  }
  return encoded;
}

/** ULID whose random part is `seed` (7 chars) plus `index` (9 chars). */
export function noteUlid(seed: number, index: number): string {
  return encodeCrockford(CREATED_MS, 10) + encodeCrockford(seed, 7) + encodeCrockford(index, 9);
}
