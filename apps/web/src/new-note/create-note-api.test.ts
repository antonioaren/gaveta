// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { clearSessionToken, setSessionToken } from '../auth/session-token.ts';
import { ABSENT_NOTE_HASH } from './absent-note-hash.ts';
import { createNoteViaApi } from './create-note-api.ts';

beforeEach(() => {
  clearSessionToken();
  setSessionToken('test-token');
});

afterEach(() => {
  vi.unstubAllGlobals();
  clearSessionToken();
});

it('posts /api/new with If-Match absent hash', async () => {
  const fetchMock = vi.fn<typeof fetch>().mockResolvedValue({
    ok: true,
    status: 200,
    json: () =>
      Promise.resolve({
        ok: true,
        schemaVersion: 1,
        data: {
          id: '01NOTE',
          path: 'nueva.html',
          hash: 'sha256:abc',
          title: 'Nueva',
          type: 'doc',
        },
      }),
  } as Response);
  vi.stubGlobal('fetch', fetchMock);

  const created = await createNoteViaApi({
    title: 'Nueva',
    type: 'doc',
    folder: '',
    tags: ['tag'],
  });

  expect(created.path).toBe('nueva.html');
  const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
  const bodyText = typeof init.body === 'string' ? init.body : '';
  expect(JSON.parse(bodyText)).toEqual({
    title: 'Nueva',
    type: 'doc',
    tags: 'tag',
    ifMatch: ABSENT_NOTE_HASH,
  });
});
