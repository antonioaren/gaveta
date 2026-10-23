// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { apiFetch } from './client.ts';
import { setSessionToken, clearSessionToken } from '../auth/session-token.ts';

beforeEach(() => {
  clearSessionToken();
  setSessionToken('secret-token');
});

afterEach(() => {
  vi.unstubAllGlobals();
  clearSessionToken();
});

it('sends x-gaveta-token on API requests', async () => {
  const fetchMock = vi.fn<typeof fetch>().mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve({ ok: true, data: {} }),
  } as Response);
  vi.stubGlobal('fetch', fetchMock);

  await apiFetch('/api/notes');

  expect(fetchMock).toHaveBeenCalledOnce();
  const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
  const headers = new Headers(init.headers);
  expect(headers.get('x-gaveta-token')).toBe('secret-token');
});
