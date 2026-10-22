import { randomBytes } from 'node:crypto';

/** Crockford base32, excluding I, L, O, and U. */
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/**
 * ULID: 48-bit timestamp plus 80 bits of entropy.
 * The same inputs always return the same id. A later timestamp sorts after an earlier one.
 */
export function createUlid(timeMs = Date.now(), entropy?: Uint8Array): string {
  const bytes = entropy ?? randomBytes(10);
  const chars: string[] = [];
  let time = Math.max(0, Math.floor(timeMs));
  for (let index = 0; index < 10; index += 1) {
    chars.push(CROCKFORD.charAt(time % 32));
    time = Math.floor(time / 32);
  }
  chars.reverse();

  let buffer = 0;
  let bits = 0;
  const source = bytes.length >= 10 ? bytes.subarray(0, 10) : bytes;
  for (const byte of source) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 5 && chars.length < 26) {
      bits -= 5;
      chars.push(CROCKFORD.charAt((buffer >> bits) & 31));
      buffer &= (1 << bits) - 1;
    }
  }
  while (chars.length < 26) {
    chars.push('0');
  }
  return chars.join('');
}
