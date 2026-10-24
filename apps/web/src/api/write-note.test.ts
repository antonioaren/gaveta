import { afterEach, describe, expect, it, vi } from 'vitest';
import { postMoveNote } from './write-note.ts';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('postMoveNote', () => {
  it('sends If-Match and returns moved data', async () => {
    const fetchMock = vi.fn((_path: string, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      expect(headers.get('if-match')).toBe('sha256:abc');
      return Promise.resolve(
        new Response(
          JSON.stringify({
            ok: true,
            schemaVersion: 1,
            data: { id: '01X', from: 'a.html', to: 'b.html', rewritten: [] },
          }),
          { status: 200 },
        ),
      );
    });
    vi.stubGlobal('fetch', fetchMock);
    const result = await postMoveNote('a.html', 'b.html', 'sha256:abc');
    expect(result.to).toBe('b.html');
  });
});
