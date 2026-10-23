// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { clearSessionToken, setSessionToken } from '../auth/session-token.ts';
import { resetVaultSocketHubForTests } from '../live/vault-socket-hub.ts';
import { useHealthData } from './useHealthData.ts';

interface MockSocket {
  readonly send: ReturnType<typeof vi.fn>;
  readonly close: ReturnType<typeof vi.fn>;
  readonly addEventListener: ReturnType<typeof vi.fn>;
  readonly removeEventListener: ReturnType<typeof vi.fn>;
  readonly readyState: number;
}

let sockets: MockSocket[] = [];
const releasePending: (() => void)[] = [];

function doctorBody(findingsCount: number): unknown {
  return {
    ok: true,
    schemaVersion: 1,
    data: {
      ok: findingsCount === 0,
      findings: Array.from({ length: findingsCount }, (_, index) => ({
        code: 'W_LINK_PENDING',
        message: `Hallazgo ${String(index + 1)}`,
        hint: 'hint',
        path: `nota-${String(index + 1)}.html`,
        details: null,
        severity: 'warning',
        noteId: '01M5HGV8800000000000000002',
      })),
      fixed: [],
    },
  };
}

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
  setSessionToken('health-live');
  sockets = [];
  releasePending.length = 0;
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

it('coalesces burst live note events into one debounced doctor fetch', async () => {
  let doctorCalls = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(() => {
      doctorCalls += 1;
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(doctorBody(doctorCalls === 1 ? 1 : 2)),
      } as Response);
    }),
  );

  const { result } = renderHook(() => useHealthData());
  const socket = await waitForVaultSocket();

  await vi.advanceTimersByTimeAsync(0);
  await vi.waitFor(() => {
    expect(result.current.report?.findings.length).toBe(1);
  });
  expect(doctorCalls).toBe(1);

  for (let index = 0; index < 8; index += 1) {
    emitMessage(socket, {
      type: 'note:changed',
      path: `nota-${String(index)}.html`,
      id: '01M5HGV8800000000000000002',
    });
  }

  await vi.advanceTimersByTimeAsync(399);
  expect(doctorCalls).toBe(1);

  await vi.advanceTimersByTimeAsync(1);
  await vi.waitFor(() => {
    expect(result.current.report?.findings.length).toBe(2);
  });
  expect(doctorCalls).toBe(2);
});

it('does not apply a stale doctor response when a newer fetch finishes first', async () => {
  let doctorCalls = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(() => {
      doctorCalls += 1;
      const call = doctorCalls;
      if (call === 1) {
        return new Promise<Response>((resolve) => {
          releasePending.push(() => {
            resolve({
              ok: true,
              status: 200,
              json: () => Promise.resolve(doctorBody(99)),
            } as Response);
          });
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(doctorBody(2)),
      } as Response);
    }),
  );

  const { result } = renderHook(() => useHealthData());

  await vi.advanceTimersByTimeAsync(0);
  await vi.waitFor(() => {
    expect(doctorCalls).toBe(1);
  });

  act(() => {
    result.current.reload();
  });
  await vi.advanceTimersByTimeAsync(0);

  await vi.waitFor(() => {
    expect(doctorCalls).toBe(2);
    expect(result.current.report?.findings.length).toBe(2);
  });

  for (const release of releasePending.splice(0)) {
    release();
  }
  await vi.advanceTimersByTimeAsync(0);

  expect(result.current.report?.findings.length).toBe(2);
});
