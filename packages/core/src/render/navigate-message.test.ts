import { expect, it } from 'vitest';
import { parseGavetaNavigateMessage } from './navigate-message.ts';

it('accepts a well-formed navigate message', () => {
  expect(
    parseGavetaNavigateMessage({ type: 'gaveta:navigate', ref: '01JB7Z3K9QX4T5M2N8V6R0WYHC' }),
  ).toEqual({
    type: 'gaveta:navigate',
    ref: '01JB7Z3K9QX4T5M2N8V6R0WYHC',
  });
});

it('rejects malformed navigate payloads', () => {
  expect(parseGavetaNavigateMessage(null)).toBeNull();
  expect(parseGavetaNavigateMessage({ type: 'evil', ref: 'x' })).toBeNull();
  expect(parseGavetaNavigateMessage({ type: 'gaveta:navigate', ref: '  ' })).toBeNull();
});
