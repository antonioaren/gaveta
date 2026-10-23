export type ConnectionsRefreshReason = 'websocket' | 'manual';

/**
 * Subscribe to vault change events that should reload the connections panel.
 * T2.2 will wire this to the serve WebSocket (`note:changed|added|removed|moved`).
 */
export function subscribeConnectionsRefresh(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- wired in T2.2
  _onRefresh: (reason: ConnectionsRefreshReason) => void,
): () => void {
  return () => undefined;
}
