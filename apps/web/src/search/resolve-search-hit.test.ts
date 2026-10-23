// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { clearSessionToken, setSessionToken } from '../auth/session-token.ts';
import {
  SEARCH_HIT_NOT_INDEXED_MESSAGE,
  resolveSearchHitFromNotes,
  resolveSearchHitOpen,
} from './resolve-search-hit.ts';
import type { NoteListItem, SearchHitView } from '../api/types.ts';

const hit: SearchHitView = {
  path: 'sin-id.html',
  id: null,
  title: 'Sin id',
  type: 'doc',
  tags: [],
  snippet: 'texto',
};

beforeEach(() => {
  clearSessionToken();
});

afterEach(() => {
  vi.unstubAllGlobals();
  clearSessionToken();
});

it('resolves a ULID directly from the search hit', () => {
  const withId: SearchHitView = {
    ...hit,
    id: '01M5HGV8800000000000000002',
  };
  expect(resolveSearchHitFromNotes(withId, [])).toEqual({
    ok: true,
    ref: '01M5HGV8800000000000000002',
    noteId: '01M5HGV8800000000000000002',
  });
});

it('resolves path to ULID from the notes list', () => {
  const notes: NoteListItem[] = [
    {
      id: '01M5HGV8800000000000000003',
      path: 'sin-id.html',
      title: 'Sin id',
      type: 'doc',
      tags: [],
      aliases: [],
    },
  ];
  expect(resolveSearchHitFromNotes(hit, notes)).toEqual({
    ok: true,
    ref: '01M5HGV8800000000000000003',
    noteId: '01M5HGV8800000000000000003',
  });
});

it('resolves id via /api/read when the hit path is not in the cached notes list', async () => {
  setSessionToken('t');
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL) => {
      const path =
        typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (!path.includes('/api/read')) {
        return Promise.reject(new Error(`unexpected ${path}`));
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            ok: true,
            schemaVersion: 1,
            data: { id: '01M5HGV8800000000000000009' },
          }),
      } as Response);
    }),
  );
  const result = await resolveSearchHitOpen(hit, []);
  expect(result).toEqual({
    ok: true,
    ref: '01M5HGV8800000000000000009',
    noteId: '01M5HGV8800000000000000009',
  });
});

it('returns a Spanish error when the note has no indexed id', async () => {
  const notes: NoteListItem[] = [
    {
      id: null,
      path: 'sin-id.html',
      title: 'Sin id',
      type: 'doc',
      tags: [],
      aliases: [],
    },
  ];
  expect(resolveSearchHitFromNotes(hit, notes)).toEqual({
    ok: false,
    message: SEARCH_HIT_NOT_INDEXED_MESSAGE,
  });
  setSessionToken('t');
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            ok: true,
            schemaVersion: 1,
            data: { id: null },
          }),
      } as Response),
    ),
  );
  const result = await resolveSearchHitOpen(hit, []);
  expect(result).toEqual({ ok: false, message: SEARCH_HIT_NOT_INDEXED_MESSAGE });
});
