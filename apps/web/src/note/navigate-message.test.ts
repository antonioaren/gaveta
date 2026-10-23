import { expect, it } from 'vitest';
import { isGavetaNavigateMessage } from './navigate-message.ts';

it('accepts a well-formed gaveta:navigate message', () => {
  expect(
    isGavetaNavigateMessage({ type: 'gaveta:navigate', ref: '01ARZ3NDEKTSV4RRFFQ69G5FAV' }),
  ).toBe(true);
  expect(isGavetaNavigateMessage({ type: 'gaveta:navigate', ref: '' })).toBe(false);
  expect(isGavetaNavigateMessage({ type: 'other', ref: 'x' })).toBe(false);
  expect(isGavetaNavigateMessage(null)).toBe(false);
});
