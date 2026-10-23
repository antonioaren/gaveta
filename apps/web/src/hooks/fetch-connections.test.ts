// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { setSessionToken, clearSessionToken } from '../auth/session-token.ts';
import { fetchConnectionsBundle } from './fetch-connections.ts';

afterEach(() => {
  vi.unstubAllGlobals();
  clearSessionToken();
});

it('aborts in-flight connection fetches when the signal is aborted', async () => {
  setSessionToken('t');
  vi.stubGlobal(
    'fetch',
    vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal ?? null;
        if (signal === null) {
          return;
        }
        signal.addEventListener('abort', () => {
          reject(new DOMException('Aborted', 'AbortError'));
        });
      });
    }),
  );
  const controller = new AbortController();
  const pending = fetchConnectionsBundle('01NOTE', controller.signal);
  controller.abort();
  await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
});
