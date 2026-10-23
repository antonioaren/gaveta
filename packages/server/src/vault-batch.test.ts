import { expect, it } from 'vitest';
import { coalescePendingChanges, sortPendingChanges } from './vault-batch.ts';

it('dedupes pending paths and orders unlink before add', () => {
  const batch = coalescePendingChanges([
    { kind: 'add', relativePath: 'other/new.html' },
    { kind: 'unlink', relativePath: 'notes/old.html' },
    { kind: 'unlink', relativePath: 'notes/old.html' },
  ]);
  const sorted = sortPendingChanges(batch);
  expect(sorted.map((item) => item.kind)).toEqual(['unlink', 'add']);
});
