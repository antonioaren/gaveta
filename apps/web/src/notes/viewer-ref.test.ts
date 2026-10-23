import { expect, it } from 'vitest';
import { isNoteUlid, noteRenderId, viewerRefForNote } from './viewer-ref.ts';

const ULID = '01ARZ3NDEKTSV4RRFFQ69G5FAV';

it('prefers the note id over the path for stable viewer URLs', () => {
  expect(
    viewerRefForNote({
      id: ULID,
      path: 'carpeta/nota.html',
      title: 'T',
      type: 'doc',
      tags: [],
      aliases: [],
    }),
  ).toBe(ULID);
});

it('exposes a render id only for indexed ULIDs', () => {
  expect(
    noteRenderId({
      id: ULID,
      path: 'x.html',
      title: 'T',
      type: 'doc',
      tags: [],
      aliases: [],
    }),
  ).toBe(ULID);
  expect(
    noteRenderId({
      id: null,
      path: 'sin-id.html',
      title: 'T',
      type: null,
      tags: [],
      aliases: [],
    }),
  ).toBeNull();
  expect(isNoteUlid('not-a-ulid')).toBe(false);
});
