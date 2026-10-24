import { expect, it } from 'vitest';
import { bytesToBase64 } from './base64.ts';

it('round-trips bytes through base64', () => {
  const bytes = new Uint8Array([72, 111, 108, 97]);
  expect(atob(bytesToBase64(bytes))).toBe('Hola');
});
