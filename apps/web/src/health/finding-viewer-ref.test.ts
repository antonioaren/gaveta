import { expect, it } from 'vitest';
import { viewerRefForFinding } from './finding-viewer-ref.ts';

it('prefers the indexed ULID over the vault path', () => {
  const ref = viewerRefForFinding({
    code: 'E_LINK_BROKEN',
    message: 'm',
    hint: 'h',
    path: 'nota.html',
    details: null,
    severity: 'error',
    noteId: '01M5HGV8800000000000000001',
  });
  expect(ref).toBe('01M5HGV8800000000000000001');
});

it('uses the note path when there is no ULID', () => {
  const ref = viewerRefForFinding({
    code: 'W_NOTE_ORPHAN',
    message: 'm',
    hint: 'h',
    path: 'huerfana.html',
    details: null,
    severity: 'warning',
    noteId: null,
  });
  expect(ref).toBe('huerfana.html');
});
