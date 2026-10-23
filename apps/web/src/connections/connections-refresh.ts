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
 * Subscribe to vault change events that should reload the connections panel.
 */
export function subscribeConnectionsRefresh(
  onRefresh: (reason: ConnectionsRefreshReason) => void,
): () => void {
  const notify = (): void => {
    onRefresh('websocket');
  };
  const unsubscribeEvents = subscribeVaultEvents((event) => {
    if (LIVE_NOTE_EVENTS.has(event.type)) {
      notify();
    }
  });
  const unsubscribeReconnect = subscribeVaultReconnect(notify);
  return () => {
    unsubscribeEvents();
    unsubscribeReconnect();
  };
}
