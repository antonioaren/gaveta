import { subscribeVaultEvents, subscribeVaultReconnect } from '../live/vault-socket-hub.ts';
import type { VaultNoteEventType } from '../live/vault-events.ts';

export type ConnectionsRefreshReason = 'websocket' | 'manual';

const LIVE_NOTE_EVENTS = new Set<VaultNoteEventType>([
  'note:changed',
  'note:added',
  'note:removed',
  'note:moved',
]);

/**
 * Subscribe to live vault note events (WebSocket and reconnect).
 */
export function subscribeVaultNoteLiveRefresh(onRefresh: () => void): () => void {
  const unsubscribeEvents = subscribeVaultEvents((event) => {
    if (LIVE_NOTE_EVENTS.has(event.type)) {
      onRefresh();
    }
  });
  const unsubscribeReconnect = subscribeVaultReconnect(onRefresh);
  return () => {
    unsubscribeEvents();
    unsubscribeReconnect();
  };
}

/**
 * Subscribe to vault change events that should reload the connections panel.
 */
export function subscribeConnectionsRefresh(
  onRefresh: (reason: ConnectionsRefreshReason) => void,
): () => void {
  return subscribeVaultNoteLiveRefresh(() => {
    onRefresh('websocket');
  });
}
