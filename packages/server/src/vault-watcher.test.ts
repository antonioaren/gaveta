import { expect, it } from 'vitest';
import { pairMoveEvent } from './vault-move.ts';

it('pairs add with a recent unlink in the same folder as note:moved', () => {
  const recent = new Map<string, number>([['notes/old.html', 1000]]);
  const paired = pairMoveEvent('notes/new.html', recent, 1050, 200);
  expect(paired).toEqual({ from: 'notes/old.html', to: 'notes/new.html' });
});

it('does not pair add when the unlink is too old', () => {
  const recent = new Map<string, number>([['notes/old.html', 1000]]);
  expect(pairMoveEvent('notes/new.html', recent, 1500, 200)).toBeNull();
});
