import { formatMessage } from '@gaveta/i18n';
import { expect, it } from 'vitest';
import { filterPaletteCommands, navigationCommands } from './palette-commands.ts';

const t = (key: Parameters<typeof formatMessage>[0]) => formatMessage(key, 'es');

it('returns navigation commands when the query is empty', () => {
  expect(filterPaletteCommands(navigationCommands(t), '').length).toBe(2);
});

it('filters commands by label', () => {
  expect(filterPaletteCommands(navigationCommands(t), 'atr').map((entry) => entry.id)).toEqual([
    'nav-back',
  ]);
});
