import { expect, it } from 'vitest';
import {
  coalescePendingChanges,
  mergePendingFileEvent,
  sortPendingChanges,
} from './vault-batch.ts';

it('dedupes pending paths and orders unlink before add', () => {
  const batch = coalescePendingChanges([
    { kind: 'add', relativePath: 'other/new.html' },
    { kind: 'unlink', relativePath: 'notes/old.html' },
    { kind: 'unlink', relativePath: 'notes/old.html' },
  ]);
  const sorted = sortPendingChanges(batch);
  expect(sorted.map((item) => item.kind)).toEqual(['unlink', 'add']);
});

it('coalesces unlink followed by add on the same path into change', () => {
  const batch = coalescePendingChanges([
    { kind: 'unlink', relativePath: 'destino-enlace.html' },
    { kind: 'add', relativePath: 'destino-enlace.html' },
  ]);
  expect(batch).toEqual([{ kind: 'change', relativePath: 'destino-enlace.html' }]);
});

it('mergePendingFileEvent turns unlink+add on one path into change', () => {
  const first = mergePendingFileEvent(undefined, {
    kind: 'unlink',
    relativePath: 'note.html',
  });
  const merged = mergePendingFileEvent(first, { kind: 'add', relativePath: 'note.html' });
  expect(merged).toEqual({ kind: 'change', relativePath: 'note.html' });
});
