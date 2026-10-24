import { expect, it } from 'vitest';
import { isGavetaTaskToggleMessage, parseGavetaTaskToggleMessage } from './task-toggle-message.ts';

it('accepts a well-formed gaveta:task-toggle message', () => {
  expect(
    isGavetaTaskToggleMessage({ type: 'gaveta:task-toggle', taskId: 'revisar', checked: false }),
  ).toBe(true);
  expect(
    parseGavetaTaskToggleMessage({ type: 'gaveta:task-toggle', taskId: 'revisar', checked: false }),
  ).toEqual({
    type: 'gaveta:task-toggle',
    taskId: 'revisar',
    checked: false,
  });
});

it('rejects malformed task toggle payloads', () => {
  expect(isGavetaTaskToggleMessage(null)).toBe(false);
  expect(isGavetaTaskToggleMessage({ type: 'gaveta:task-toggle', taskId: 'x', checked: 'n' })).toBe(
    false,
  );
  expect(parseGavetaTaskToggleMessage({ type: 'gaveta:navigate', ref: 'x' })).toBeNull();
});
