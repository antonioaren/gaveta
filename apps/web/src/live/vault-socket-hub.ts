import { getSessionToken } from '../auth/session-token.ts';
import { recordLivePipelineFromServer } from './live-pipeline-client.ts';
import type { LivePipelineTracePayload } from './live-pipeline-types.ts';
import type { VaultNoteEvent } from './vault-events.ts';
import { vaultWebSocketUrl } from './vault-events.ts';

type VaultListener = (event: VaultNoteEvent) => void;
type ReconnectListener = () => void;
type AuthFailureListener = (message: string) => void;

const AUTH_FAILURE_MESSAGE =
  'La sesión en vivo ha caducado. Vuelve a abrir Gaveta desde la CLI para seguir recibiendo cambios.';

const INITIAL_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS = 30_000;

let socket: WebSocket | null = null;
let authed = false;
let hadConnectedOnce = false;
let authFailed = false;
let intentionalClose = false;
let backoffMs = INITIAL_BACKOFF_MS;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

const listeners = new Set<VaultListener>();
const reconnectListeners = new Set<ReconnectListener>();
const authFailureListeners = new Set<AuthFailureListener>();

function dispatch(event: VaultNoteEvent): void {
  for (const listener of listeners) {
    listener(event);
  }
}

function notifyReconnect(): void {
  for (const listener of reconnectListeners) {
    listener();
  }
}

function notifyAuthFailure(message: string): void {
  for (const listener of authFailureListeners) {
    listener(message);
  }
}

function clearReconnectTimer(): void {
  if (reconnectTimer !== null) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}

function scheduleReconnect(): void {
  if (intentionalClose || authFailed || listeners.size === 0) {
    return;
  }
  if (reconnectTimer !== null) {
    return;
  }
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
    backoffMs = Math.min(backoffMs * 2, MAX_BACKOFF_MS);
  }, backoffMs);
}

function readStageOffset(
  stages: Record<string, unknown>,
  key: keyof LivePipelineTracePayload['stages'],
): number | undefined {
  const value = stages[key];
  return typeof value === 'number' ? value : undefined;
}

function parsePipelineTrace(value: unknown): LivePipelineTracePayload | undefined {
  if (typeof value !== 'object' || value === null) {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  if (record.anchor !== 'writeFinished' || typeof record.path !== 'string') {
    return undefined;
  }
  if (typeof record.stages !== 'object' || record.stages === null) {
    return undefined;
  }
  const rawStages = record.stages as Record<string, unknown>;
  const stages: LivePipelineTracePayload['stages'] = {
    writeFinished: readStageOffset(rawStages, 'writeFinished'),
    chokidar: readStageOffset(rawStages, 'chokidar'),
    debounceFlush: readStageOffset(rawStages, 'debounceFlush'),
    indexUpdated: readStageOffset(rawStages, 'indexUpdated'),
    wsSent: readStageOffset(rawStages, 'wsSent'),
  };
  return {
    anchor: 'writeFinished',
    path: record.path,
    stages,
  };
}

function handleMessage(message: MessageEvent): void {
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
    const reconnecting = hadConnectedOnce;
    authed = true;
    hadConnectedOnce = true;
    backoffMs = INITIAL_BACKOFF_MS;
    if (reconnecting) {
      notifyReconnect();
    }
    return;
  }
  if (record.type === 'error' && record.code === 'E_AUTH_REQUIRED') {
    authFailed = true;
    notifyAuthFailure(AUTH_FAILURE_MESSAGE);
    socket?.close();
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
    const pipeline = parsePipelineTrace(record.pipeline);
    const event: VaultNoteEvent = {
      type: record.type,
      path: String(record.path),
      id: record.id === null || typeof record.id === 'string' ? record.id : null,
      ...(pipeline === undefined ? {} : { pipeline }),
    };
    if (pipeline !== undefined) {
      const writeAnchor = (globalThis as { __gavetaWriteFinishedAt?: number })
        .__gavetaWriteFinishedAt;
      const wsReceivedMs =
        writeAnchor === undefined ? undefined : Math.max(0, performance.now() - writeAnchor);
      recordLivePipelineFromServer(
        event.path,
        pipeline.stages,
        wsReceivedMs ?? pipeline.stages.wsSent ?? 0,
      );
    }
    if (typeof record.from === 'string') {
      dispatch({ ...event, from: record.from });
    } else {
      dispatch(event);
    }
  }
}

function connect(): void {
  if (socket !== null || authFailed) {
    return;
  }
  const token = getSessionToken();
  if (token === null) {
    return;
  }
  intentionalClose = false;
  socket = new WebSocket(vaultWebSocketUrl());
  socket.addEventListener('open', () => {
    socket?.send(JSON.stringify({ type: 'auth', token }));
  });
  socket.addEventListener('message', handleMessage);
  socket.addEventListener('close', (event) => {
    socket = null;
    authed = false;
    if (event.code === 4401) {
      authFailed = true;
      notifyAuthFailure(AUTH_FAILURE_MESSAGE);
      return;
    }
    if (!intentionalClose) {
      scheduleReconnect();
    }
  });
}

function ensureSocket(): void {
  if (socket === null && !authFailed) {
    connect();
  }
}

export function subscribeVaultEvents(listener: VaultListener): () => void {
  ensureSocket();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      intentionalClose = true;
      clearReconnectTimer();
      if (socket !== null) {
        socket.close();
        socket = null;
      }
      authed = false;
      intentionalClose = false;
    }
  };
}

export function subscribeVaultReconnect(listener: ReconnectListener): () => void {
  reconnectListeners.add(listener);
  return () => {
    reconnectListeners.delete(listener);
  };
}

export function subscribeVaultAuthFailure(listener: AuthFailureListener): () => void {
  authFailureListeners.add(listener);
  return () => {
    authFailureListeners.delete(listener);
  };
}

/** Test-only reset of hub state. */
export function resetVaultSocketHubForTests(): void {
  intentionalClose = true;
  clearReconnectTimer();
  if (socket !== null) {
    socket.close();
    socket = null;
  }
  intentionalClose = false;
  authed = false;
  hadConnectedOnce = false;
  authFailed = false;
  backoffMs = INITIAL_BACKOFF_MS;
  listeners.clear();
  reconnectListeners.clear();
  authFailureListeners.clear();
}
