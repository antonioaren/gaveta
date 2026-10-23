// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { clearSessionToken, setSessionToken } from '../auth/session-token.ts';
import { resetVaultSocketHubForTests } from '../live/vault-socket-hub.ts';
import { usePaletteSearch } from './usePaletteSearch.ts';

interface MockSocket {
  readonly send: ReturnType<typeof vi.fn>;
  readonly close: ReturnType<typeof vi.fn>;
  readonly addEventListener: ReturnType<typeof vi.fn>;
  readonly removeEventListener: ReturnType<typeof vi.fn>;
  readonly readyState: number;
}

let sockets: MockSocket[] = [];

function createMockSocket(): MockSocket {
  const listeners = new Map<string, Set<(event: unknown) => void>>();
  const socket: MockSocket = {
    send: vi.fn(),
    close: vi.fn(() => {
      const handler = listeners.get('close');
      if (handler) {
        for (const fn of handler) {
          fn({ code: 1006 });
        }
      }
    }),
    addEventListener: vi.fn((type: string, handler: (event: unknown) => void) => {
      const set = listeners.get(type) ?? new Set();
      set.add(handler);
      listeners.set(type, set);
      if (type === 'open') {
        queueMicrotask(() => {
          handler({});
        });
      }
    }),
    removeEventListener: vi.fn(),
    readyState: 1,
  };
  sockets.push(socket);
  return socket;
}

function emitMessage(socket: MockSocket, payload: unknown): void {
  const handler = socket.addEventListener.mock.calls.find(([type]) => type === 'message')?.[1] as
    ((event: { data: string }) => void) | undefined;
  handler?.({ data: JSON.stringify(payload) });
}

async function waitForVaultSocket(): Promise<MockSocket> {
  await vi.waitFor(() => {
    expect(sockets.length).toBeGreaterThan(0);
  });
  const socket = sockets[0];
  if (socket === undefined) {
    throw new Error('expected vault socket');
  }
  emitMessage(socket, { type: 'auth:ok' });
  return socket;
}

beforeEach(() => {
  vi.useFakeTimers();
  clearSessionToken();
  setSessionToken('search-live');
  sockets = [];
  vi.stubGlobal(
    'WebSocket',
    vi.fn(function MockWebSocket() {
      return createMockSocket();
    }),
  );
});

afterEach(() => {
  resetVaultSocketHubForTests();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  clearSessionToken();
});

it('re-runs search when a live vault note event arrives while the palette is open', async () => {
  let searchCalls = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(() => {
      searchCalls += 1;
      const hitTitle = searchCalls === 1 ? 'Primera' : 'Actualizada';
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            ok: true,
            schemaVersion: 1,
            data: {
              query: 'nota',
              type: null,
              tag: null,
              limit: 20,
              hits: [
                {
                  path: 'nota.html',
                  id: '01M5HGV8800000000000000002',
                  title: hitTitle,
                  type: 'doc',
                  tags: [],
                  snippet: 'texto',
                },
              ],
            },
          }),
      } as Response);
    }),
  );

  const { result } = renderHook(() => usePaletteSearch('nota', true));
  const socket = await waitForVaultSocket();

  await vi.advanceTimersByTimeAsync(300);
  await vi.waitFor(() => {
    expect(result.current.hits[0]?.title).toBe('Primera');
  });
  expect(searchCalls).toBe(1);

  emitMessage(socket, {
    type: 'note:changed',
    path: 'nota.html',
    id: '01M5HGV8800000000000000002',
  });

  await vi.advanceTimersByTimeAsync(300);
  await vi.waitFor(() => {
    expect(result.current.hits[0]?.title).toBe('Actualizada');
  });
  expect(searchCalls).toBe(2);
});
