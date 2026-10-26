import { expect, it } from 'vitest';
import {
  RECENT_MOVE_PATH_MAX_SIZE,
  RECENT_MOVE_PATH_TTL_MS,
  pairMoveByNoteId,
  pruneRecentMovePaths,
  rememberRecentMovePath,
} from './vault-move.ts';

it('pairs add with a recent unlink that shares the same note id across folders', () => {
  const recent = new Map([['notes/old.html', { id: '01M5HGV8800000000000000002', at: 1000 }]]);
  const from = pairMoveByNoteId('01M5HGV8800000000000000002', recent, 1050, 200);
  expect(from).toBe('notes/old.html');
});

it('does not pair when the buffered path has a different note id', () => {
  const recent = new Map([['notes/old.html', { id: '01OTHER', at: 1000 }]]);
  expect(pairMoveByNoteId('01NOTE', recent, 1050, 200)).toBeNull();
});

it('does not pair when the buffered path is older than the TTL', () => {
  const recent = new Map([['notes/old.html', { id: '01NOTE', at: 1000 }]]);
  expect(pairMoveByNoteId('01NOTE', recent, 1000 + 201, 200)).toBeNull();
});

it('pairs across multi-second FSEvents gaps within the generous TTL', () => {
  const recent = new Map([['notes/old.html', { id: '01NOTE', at: 1000 }]]);
  expect(pairMoveByNoteId('01NOTE', recent, 1000 + 45_000, RECENT_MOVE_PATH_TTL_MS)).toBe(
    'notes/old.html',
  );
});

it('drops entries older than the TTL', () => {
  const recent = new Map<string, import('./vault-move.ts').RecentUnlink>([
    ['stale.html', { id: '01OLD', at: 0 }],
    ['keep.html', { id: '01KEEP', at: 9000 }],
  ]);
  pruneRecentMovePaths(recent, 10_000, 1000, RECENT_MOVE_PATH_MAX_SIZE);
  expect(recent.has('stale.html')).toBe(false);
  expect(recent.get('keep.html')?.id).toBe('01KEEP');
});

it('caps the number of buffered paths by evicting the oldest', () => {
  const recent = new Map<string, import('./vault-move.ts').RecentUnlink>();
  const now = 20_000;
  const maxSize = 8;
  for (let i = 0; i < maxSize + 5; i += 1) {
    rememberRecentMovePath(recent, `notes/n-${String(i)}.html`, '01NOTE', now + i, 60_000, maxSize);
  }
  expect(recent.size).toBe(maxSize);
  expect(recent.has(`notes/n-${String(maxSize + 4)}.html`)).toBe(true);
  expect(recent.has('notes/n-0.html')).toBe(false);
});
