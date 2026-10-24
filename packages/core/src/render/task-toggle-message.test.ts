import { expect, it } from 'vitest';
import {
  parseGavetaTaskCheckedMessage,
  parseGavetaTaskToggleMessage,
} from './task-toggle-message.ts';

it('accepts a well-formed gaveta:task-toggle message', () => {
  expect(
    parseGavetaTaskToggleMessage({ type: 'gaveta:task-toggle', taskId: 'revisar', checked: true }),
  ).toEqual({
    type: 'gaveta:task-toggle',
    taskId: 'revisar',
    checked: true,
  });
});

it('rejects malformed task toggle payloads', () => {
  expect(parseGavetaTaskToggleMessage(null)).toBeNull();
  expect(parseGavetaTaskToggleMessage({ type: 'evil' })).toBeNull();
  expect(
    parseGavetaTaskToggleMessage({ type: 'gaveta:task-toggle', taskId: '', checked: true }),
  ).toBeNull();
  expect(
    parseGavetaTaskToggleMessage({ type: 'gaveta:task-toggle', taskId: 'bad id', checked: true }),
  ).toBeNull();
  expect(
    parseGavetaTaskToggleMessage({ type: 'gaveta:task-toggle', taskId: 'ok', checked: 'yes' }),
  ).toBeNull();
});

it('accepts gaveta:task-checked for parent-driven revert', () => {
  expect(
    parseGavetaTaskCheckedMessage({ type: 'gaveta:task-checked', taskId: 'hecho', checked: false }),
  ).toEqual({
    type: 'gaveta:task-checked',
    taskId: 'hecho',
    checked: false,
  });
});
