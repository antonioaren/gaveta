import { expect, it } from 'vitest';
import { pairMoveByNoteId } from './vault-move.ts';

it('pairs add with a recent unlink that shares the same note id across folders', () => {
  const recent = new Map([['notes/old.html', { id: '01M5HGV8800000000000000002', at: 1000 }]]);
  const from = pairMoveByNoteId('01M5HGV8800000000000000002', recent, 1050, 200);
  expect(from).toBe('notes/old.html');
});

it('does not pair when the buffered path has a different note id', () => {
  const recent = new Map([['notes/old.html', { id: '01OTHER', at: 1000 }]]);
  expect(pairMoveByNoteId('01NOTE', recent, 9_000_000, 200)).toBeNull();
});

it('pairs across long FSEvents gaps when the note id still matches', () => {
  const recent = new Map([['notes/old.html', { id: '01NOTE', at: 1000 }]]);
  expect(pairMoveByNoteId('01NOTE', recent, 9_000_000, 200)).toBe('notes/old.html');
});
