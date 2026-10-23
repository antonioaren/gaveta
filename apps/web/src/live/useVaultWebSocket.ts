import { useEffect } from 'react';
import type { VaultNoteEvent } from './vault-events.ts';
import { subscribeVaultEvents } from './vault-socket-hub.ts';

export function useVaultWebSocket(onEvent: (event: VaultNoteEvent) => void): void {
  useEffect(() => subscribeVaultEvents(onEvent), [onEvent]);
}
