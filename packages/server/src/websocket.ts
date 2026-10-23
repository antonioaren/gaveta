import websocket from '@fastify/websocket';
import type { FastifyInstance } from 'fastify';
import type { RawData, WebSocket } from 'ws';
import { tokensMatch } from './auth.ts';
import {
  GAVETA_WS_PATH,
  WS_AUTH_TIMEOUT_MS,
  WS_MAX_CONNECTIONS,
  WS_MAX_MESSAGE_BYTES,
  WS_MAX_PENDING_CONNECTIONS,
} from './constants.ts';
import type { VaultEventBus, VaultNoteEvent } from './vault-events.ts';
import { rawDataByteLength } from './ws-bytes.ts';
import { wsMessageText } from './ws-message.ts';

const AUTH_MESSAGE = 'auth';
const AUTH_OK = 'auth:ok';
const ERROR_MESSAGE = 'error';

interface ClientAuthMessage {
  readonly type: typeof AUTH_MESSAGE;
  readonly token: string;
}

export async function registerVaultWebSocket(
  app: FastifyInstance,
  token: string,
  bus: VaultEventBus,
  authTimeoutMs: number = WS_AUTH_TIMEOUT_MS,
): Promise<void> {
  await app.register(websocket, {
    options: { maxPayload: WS_MAX_MESSAGE_BYTES },
  });
  let authenticatedConnections = 0;
  let pendingConnections = 0;

  app.get(GAVETA_WS_PATH, { websocket: true }, (socket) => {
    if (pendingConnections >= WS_MAX_PENDING_CONNECTIONS) {
      sendError(socket, 'E_ARG_INVALID', 'Demasiadas conexiones en vivo');
      socket.close(1013, 'Demasiadas conexiones en vivo');
      return;
    }
    pendingConnections += 1;
    let authed = false;
    let unsubscribe: (() => void) | null = null;
    const authTimer = setTimeout(() => {
      if (!authed) {
        sendError(socket, 'E_AUTH_REQUIRED', 'Autenticación requerida');
        socket.close(4401, 'Autenticación requerida');
      }
    }, authTimeoutMs);

    const cleanup = (): void => {
      clearTimeout(authTimer);
      if (unsubscribe !== null) {
        unsubscribe();
        unsubscribe = null;
      }
      if (authed) {
        authenticatedConnections = Math.max(0, authenticatedConnections - 1);
        authed = false;
      } else {
        pendingConnections = Math.max(0, pendingConnections - 1);
      }
    };

    socket.on('close', cleanup);
    socket.on('error', cleanup);

    socket.on('message', (raw: RawData) => {
      if (rawDataByteLength(raw) > WS_MAX_MESSAGE_BYTES) {
        sendError(socket, 'E_ARG_INVALID', 'Mensaje demasiado grande');
        socket.close(1009, 'Mensaje demasiado grande');
        return;
      }
      const text = wsMessageText(raw);
      if (!authed) {
        const message = parseAuthMessage(text);
        if (message === null || !tokensMatch(message.token, token)) {
          sendError(socket, 'E_AUTH_REQUIRED', 'Autenticación requerida');
          socket.close(4401, 'Autenticación requerida');
          return;
        }
        if (authenticatedConnections >= WS_MAX_CONNECTIONS) {
          sendError(socket, 'E_ARG_INVALID', 'Demasiadas conexiones en vivo');
          socket.close(1013, 'Demasiadas conexiones en vivo');
          return;
        }
        pendingConnections = Math.max(0, pendingConnections - 1);
        authed = true;
        authenticatedConnections += 1;
        clearTimeout(authTimer);
        socket.send(JSON.stringify({ type: AUTH_OK }));
        unsubscribe = bus.onNote((event) => {
          sendVaultEvent(socket, event);
        });
        return;
      }
      sendError(socket, 'E_ARG_INVALID', 'Solo se admite el mensaje de autenticación');
    });
  });
}

function sendVaultEvent(socket: WebSocket, event: VaultNoteEvent): void {
  const payload = JSON.stringify(event);
  if (Buffer.byteLength(payload, 'utf8') > WS_MAX_MESSAGE_BYTES) {
    return;
  }
  if (socket.readyState === socket.OPEN) {
    socket.send(payload);
  }
}

function sendError(socket: WebSocket, code: string, message: string): void {
  if (socket.readyState !== socket.OPEN) {
    return;
  }
  const payload = JSON.stringify({ type: ERROR_MESSAGE, code, message });
  if (Buffer.byteLength(payload, 'utf8') > WS_MAX_MESSAGE_BYTES) {
    return;
  }
  socket.send(payload);
}

function parseAuthMessage(text: string): ClientAuthMessage | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) {
    return null;
  }
  const record = parsed as Record<string, unknown>;
  if (record.type !== AUTH_MESSAGE || typeof record.token !== 'string') {
    return null;
  }
  if (record.token.length === 0 || record.token.length > 512) {
    return null;
  }
  return { type: AUTH_MESSAGE, token: record.token };
}

export function readWebSocketTokenFromMessage(text: string, expected: string): boolean {
  const message = parseAuthMessage(text);
  if (message === null) {
    return false;
  }
  return tokensMatch(message.token, expected);
}
