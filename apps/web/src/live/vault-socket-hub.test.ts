// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { setSessionToken, clearSessionToken } from '../auth/session-token.ts';
import {
  resetVaultSocketHubForTests,
  subscribeVaultAuthFailure,
  subscribeVaultEvents,
  subscribeVaultReconnect,
} from './vault-socket-hub.ts';

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

beforeEach(() => {
  vi.useFakeTimers();
  clearSessionToken();
  setSessionToken('live-token');
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

it('reconnects with backoff and notifies listeners after auth', async () => {
  const reconnects: number[] = [];
  subscribeVaultReconnect(() => {
    reconnects.push(1);
  });
  subscribeVaultEvents(() => {
    /* keep hub alive */
  });
  await vi.waitFor(() => {
    expect(sockets.length).toBe(1);
  });
  const first = sockets[0];
  if (first === undefined) {
    throw new Error('expected socket');
  }
  emitMessage(first, { type: 'auth:ok' });
  const firstClose = first.addEventListener.mock.calls.find(([type]) => type === 'close')?.[1] as
    ((event: { code: number }) => void) | undefined;
  firstClose?.({ code: 1006 });
  await vi.advanceTimersByTimeAsync(1_000);
  await vi.waitFor(() => {
    expect(sockets.length).toBe(2);
  });
  const second = sockets[1];
  if (second === undefined) {
    throw new Error('expected second socket');
  }
  emitMessage(second, { type: 'auth:ok' });
  expect(reconnects.length).toBe(1);
});

it('ignores close events from a replaced socket', async () => {
  const events: string[] = [];
  subscribeVaultEvents((event) => {
    events.push(event.type);
  });
  await vi.waitFor(() => {
    expect(sockets.length).toBe(1);
  });
  const first = sockets[0];
  if (first === undefined) {
    throw new Error('expected socket');
  }
  emitMessage(first, { type: 'auth:ok' });
  emitMessage(first, {
    type: 'note:changed',
    path: 'a.html',
    id: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
  });
  expect(events).toEqual(['note:changed']);

  const firstClose = first.addEventListener.mock.calls.find(([type]) => type === 'close')?.[1] as
    ((event: { code: number }) => void) | undefined;
  firstClose?.({ code: 1006 });
  await vi.advanceTimersByTimeAsync(1_000);
  await vi.waitFor(() => {
    expect(sockets.length).toBe(2);
  });
  const second = sockets[1];
  if (second === undefined) {
    throw new Error('expected second socket');
  }
  emitMessage(second, { type: 'auth:ok' });
  emitMessage(second, {
    type: 'note:changed',
    path: 'b.html',
    id: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
  });
  expect(events).toEqual(['note:changed', 'note:changed']);

  firstClose?.({ code: 1006 });
  expect(sockets.length).toBe(2);
});

it('does not reconnect after a 4401 auth failure and surfaces a Spanish notice', async () => {
  const failures: string[] = [];
  subscribeVaultAuthFailure((message) => {
    failures.push(message);
  });
  subscribeVaultEvents(() => {
    /* keep hub alive */
  });
  await vi.waitFor(() => {
    expect(sockets.length).toBe(1);
  });
  const socket = sockets[0];
  if (socket === undefined) {
    throw new Error('expected socket');
  }
  const closeHandler = socket.addEventListener.mock.calls.find(
    ([type]) => type === 'close',
  )?.[1] as ((event: { code: number }) => void) | undefined;
  closeHandler?.({ code: 4401 });
  await vi.waitFor(() => {
    expect(failures.length).toBe(1);
  });
  expect(failures[0]).toContain('sesión en vivo');
  await vi.advanceTimersByTimeAsync(5_000);
  expect(sockets.length).toBe(1);
});
