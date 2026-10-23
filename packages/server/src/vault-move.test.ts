import { expect, it } from 'vitest';
import { pairMoveByNoteId } from './vault-move.ts';

it('pairs add with a recent unlink that shares the same note id across folders', () => {
  const recent = new Map([['notes/old.html', { id: '01M5HGV8800000000000000002', at: 1000 }]]);
  const from = pairMoveByNoteId('01M5HGV8800000000000000002', recent, 1050, 200);
  expect(from).toBe('notes/old.html');
});

it('does not pair when the unlink is too old', () => {
  const recent = new Map([['notes/old.html', { id: '01NOTE', at: 1000 }]]);
  expect(pairMoveByNoteId('01NOTE', recent, 1500, 200)).toBeNull();
});
