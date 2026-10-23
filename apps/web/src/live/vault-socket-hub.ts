import { getSessionToken } from '../auth/session-token.ts';
import type { VaultNoteEvent } from './vault-events.ts';
import { vaultWebSocketUrl } from './vault-events.ts';

type VaultListener = (event: VaultNoteEvent) => void;

let socket: WebSocket | null = null;
let authed = false;
const listeners = new Set<VaultListener>();

function dispatch(event: VaultNoteEvent): void {
  for (const listener of listeners) {
    listener(event);
  }
}

function ensureSocket(): void {
  if (socket !== null) {
    return;
  }
  const token = getSessionToken();
  if (token === null) {
    return;
  }
  socket = new WebSocket(vaultWebSocketUrl());
  socket.addEventListener('open', () => {
    socket?.send(JSON.stringify({ type: 'auth', token }));
  });
  socket.addEventListener('message', (message) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(String(message.data));
    } catch {
      return;
    }
    if (typeof parsed !== 'object' || parsed === null) {
      return;
    }
    const record = parsed as Record<string, unknown>;
    if (record.type === 'auth:ok') {
      authed = true;
      return;
    }
    if (!authed) {
      return;
    }
    if (
      record.type === 'note:changed' ||
      record.type === 'note:added' ||
      record.type === 'note:removed' ||
      record.type === 'note:moved'
    ) {
      const event: VaultNoteEvent = {
        type: record.type,
        path: String(record.path),
        id: record.id === null || typeof record.id === 'string' ? record.id : null,
      };
      if (typeof record.from === 'string') {
        dispatch({ ...event, from: record.from });
      } else {
        dispatch(event);
      }
    }
  });
  socket.addEventListener('close', () => {
    socket = null;
    authed = false;
  });
}

export function subscribeVaultEvents(listener: VaultListener): () => void {
  ensureSocket();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && socket !== null) {
      socket.close();
      socket = null;
      authed = false;
    }
  };
}
