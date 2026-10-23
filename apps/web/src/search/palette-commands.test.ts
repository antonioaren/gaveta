import { expect, it } from 'vitest';
import { filterPaletteCommands } from './palette-commands.ts';

it('returns navigation commands when the query is empty', () => {
  expect(filterPaletteCommands('').length).toBe(2);
});

it('filters commands by label', () => {
  expect(filterPaletteCommands('atr').map((entry) => entry.id)).toEqual(['nav-back']);
});
