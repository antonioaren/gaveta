// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { clearSessionToken, setSessionToken } from '../auth/session-token.ts';
import { saveNoteReplace } from './note-write.ts';

beforeEach(() => {
  clearSessionToken();
  setSessionToken('token');
});

afterEach(() => {
  vi.unstubAllGlobals();
  clearSessionToken();
});

it('returns conflict result on 409 without throwing', async () => {
  const fetchMock = vi.fn<typeof fetch>().mockResolvedValue({
    ok: false,
    status: 409,
    json: () =>
      Promise.resolve({
        ok: false,
        error: {
          code: 'E_CONFLICT',
          message: 'La nota cambió en otro sitio.',
          details: { hash: 'abc123' },
        },
      }),
  } as Response);
  vi.stubGlobal('fetch', fetchMock);

  const result = await saveNoteReplace('Nota X', 'stale', '<p>x</p>');
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.status).toBe(409);
    expect(result.code).toBe('E_CONFLICT');
    expect(result.hash).toBe('abc123');
  }
});
