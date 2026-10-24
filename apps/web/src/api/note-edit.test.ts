// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { saveNoteDocument } from './note-edit.ts';
import { clearSessionToken, setSessionToken } from '../auth/session-token.ts';

beforeEach(() => {
  clearSessionToken();
  setSessionToken('token');
});

afterEach(() => {
  vi.unstubAllGlobals();
  clearSessionToken();
});

it('posts document scope edits with If-Match', async () => {
  const fetchMock = vi.fn<typeof fetch>().mockResolvedValue({
    ok: true,
    status: 200,
    json: () =>
      Promise.resolve({
        ok: true,
        data: { hash: 'sha256:abc', path: 'nota.html', title: 'T' },
      }),
  } as Response);
  vi.stubGlobal('fetch', fetchMock);

  const result = await saveNoteDocument('Nota', '<p>x</p>', 'sha256:old');
  expect(result.hash).toBe('sha256:abc');

  const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
  expect(init.method).toBe('POST');
  const headers = new Headers(init.headers);
  expect(headers.get('If-Match')).toBe('sha256:old');
  expect(typeof init.body).toBe('string');
  const body = JSON.parse(init.body as string) as Record<string, unknown>;
  expect(body.scope).toBe('document');
  expect(body.mode).toBe('replace');
});
