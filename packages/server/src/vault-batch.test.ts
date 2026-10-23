import { expect, it } from 'vitest';
import { coalescePendingChanges } from './vault-batch.ts';

it('coalesces unlink+add in the same folder into moved', () => {
  const batch = coalescePendingChanges([
    { kind: 'unlink', relativePath: 'notes/old.html' },
    { kind: 'add', relativePath: 'notes/new.html' },
  ]);
  expect(batch).toEqual([{ kind: 'moved', from: 'notes/old.html', to: 'notes/new.html' }]);
});
