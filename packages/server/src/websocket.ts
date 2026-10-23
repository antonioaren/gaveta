import websocket from '@fastify/websocket';
import type { FastifyInstance } from 'fastify';
import type { RawData, WebSocket } from 'ws';
import { tokensMatch } from './auth.ts';
import {
  GAVETA_WS_PATH,
  WS_AUTH_TIMEOUT_MS,
  WS_MAX_CONNECTIONS,
  WS_MAX_MESSAGE_BYTES,
} from './constants.ts';
import type { VaultEventBus, VaultNoteEvent } from './vault-events.ts';

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
  await app.register(websocket);
  let openConnections = 0;

  app.get(GAVETA_WS_PATH, { websocket: true }, (socket) => {
    if (openConnections >= WS_MAX_CONNECTIONS) {
      socket.close(1013, 'Demasiadas conexiones en vivo');
      return;
    }
    openConnections += 1;
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
      openConnections = Math.max(0, openConnections - 1);
    };

    socket.on('close', cleanup);
    socket.on('error', cleanup);

    socket.on('message', (raw: RawData) => {
      const text = rawDataToString(raw);
      if (text.length > WS_MAX_MESSAGE_BYTES) {
        sendError(socket, 'E_ARG_INVALID', 'Mensaje demasiado grande');
        socket.close(1009, 'Mensaje demasiado grande');
        return;
      }
      if (!authed) {
        const message = parseAuthMessage(text);
        if (message === null || !tokensMatch(message.token, token)) {
          sendError(socket, 'E_AUTH_REQUIRED', 'Autenticación requerida');
          socket.close(4401, 'Autenticación requerida');
          return;
        }
        authed = true;
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
  if (payload.length > WS_MAX_MESSAGE_BYTES) {
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
  socket.send(JSON.stringify({ type: ERROR_MESSAGE, code, message }));
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

function rawDataToString(raw: RawData): string {
  if (typeof raw === 'string') {
    return raw;
  }
  if (Buffer.isBuffer(raw)) {
    return raw.toString('utf8');
  }
  if (Array.isArray(raw)) {
    return Buffer.concat(raw).toString('utf8');
  }
  return Buffer.from(raw).toString('utf8');
}

export function readWebSocketTokenFromMessage(text: string, expected: string): boolean {
  const message = parseAuthMessage(text);
  if (message === null) {
    return false;
  }
  return tokensMatch(message.token, expected);
}
