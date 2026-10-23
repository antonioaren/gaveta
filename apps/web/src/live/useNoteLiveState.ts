import { useCallback, useEffect, useState } from 'react';
import { useVaultWebSocket } from './useVaultWebSocket.ts';
import { subscribeVaultReconnect } from './vault-socket-hub.ts';

export function useNoteLiveState(noteId: string | null): {
  readonly reloadKey: number;
  readonly deleted: boolean;
} {
  const [reloadKey, setReloadKey] = useState(0);
  const [deleted, setDeleted] = useState(false);

  const onEvent = useCallback(
    (event: { readonly type: string; readonly id: string | null }) => {
      if (noteId === null || event.id !== noteId) {
        return;
      }
      if (event.type === 'note:removed') {
        setDeleted(true);
        return;
      }
      if (
        event.type === 'note:changed' ||
        event.type === 'note:moved' ||
        event.type === 'note:added'
      ) {
        setDeleted(false);
        if (event.type === 'note:changed' || event.type === 'note:moved') {
          setReloadKey((value) => value + 1);
        }
      }
    },
    [noteId],
  );
  useVaultWebSocket(onEvent);

  useEffect(() => {
    return subscribeVaultReconnect(() => {
      setDeleted(false);
      setReloadKey((value) => value + 1);
    });
  }, []);

  return { reloadKey, deleted };
}
