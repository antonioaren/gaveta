// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { clearSessionToken, setSessionToken } from '../auth/session-token.ts';
import { todoSetChecked } from './todo-write.ts';

beforeEach(() => {
  clearSessionToken();
  setSessionToken('token');
});

afterEach(() => {
  vi.unstubAllGlobals();
  clearSessionToken();
});

it('posts todo check with If-Match', async () => {
  const fetchMock = vi.fn<typeof fetch>().mockResolvedValue({
    ok: true,
    status: 200,
    json: () =>
      Promise.resolve({
        ok: true,
        data: { hash: 'sha256:abc', taskId: 'revisar', checked: true },
      }),
  } as Response);
  vi.stubGlobal('fetch', fetchMock);

  const result = await todoSetChecked('Enlace 20', 'revisar', true, 'sha256:old');

  expect(result.checked).toBe(true);
  expect(fetchMock).toHaveBeenCalledOnce();
  const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
  expect(url).toBe('/api/todo/check');
  const headers = new Headers(init.headers);
  expect(headers.get('if-match')).toBe('sha256:old');
  expect(JSON.parse(init.body as string)).toEqual({ ref: 'Enlace 20', taskId: 'revisar' });
});

it('posts todo uncheck to the uncheck route', async () => {
  const fetchMock = vi.fn<typeof fetch>().mockResolvedValue({
    ok: true,
    status: 200,
    json: () =>
      Promise.resolve({
        ok: true,
        data: { hash: 'sha256:def', taskId: 'hecho', checked: false },
      }),
  } as Response);
  vi.stubGlobal('fetch', fetchMock);

  await todoSetChecked('Enlace 20', 'hecho', false, 'sha256:old');

  const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
  expect(url).toBe('/api/todo/uncheck');
});
