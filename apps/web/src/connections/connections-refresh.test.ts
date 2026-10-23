// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { clearSessionToken, setSessionToken } from '../auth/session-token.ts';
import { resetVaultSocketHubForTests } from '../live/vault-socket-hub.ts';
import { subscribeConnectionsRefresh } from './connections-refresh.ts';

interface MockSocket {
  readonly send: ReturnType<typeof vi.fn>;
  readonly close: ReturnType<typeof vi.fn>;
  readonly addEventListener: ReturnType<typeof vi.fn>;
}

let sockets: MockSocket[] = [];

function createMockSocket(): MockSocket {
  const listeners = new Map<string, Set<(event: unknown) => void>>();
  const socket: MockSocket = {
    send: vi.fn(),
    close: vi.fn(),
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
  clearSessionToken();
  setSessionToken('connections-refresh-token');
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
  vi.unstubAllGlobals();
  clearSessionToken();
});

it('notifies with reason websocket when a live note event arrives', async () => {
  const reasons: string[] = [];
  subscribeConnectionsRefresh((reason) => {
    reasons.push(reason);
  });
  await vi.waitFor(() => {
    expect(sockets.length).toBe(1);
  });
  const socket = sockets[0];
  if (socket === undefined) {
    throw new Error('expected socket');
  }
  emitMessage(socket, { type: 'auth:ok' });
  emitMessage(socket, {
    type: 'note:changed',
    path: 'demo.html',
    id: '01M5HGV8800000000000000001',
  });
  expect(reasons).toEqual(['websocket']);
});
