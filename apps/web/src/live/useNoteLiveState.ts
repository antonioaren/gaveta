import { useCallback, useEffect, useState } from 'react';
import { pushLiveE2eLog } from './live-e2e-log.ts';
import { useVaultWebSocket } from './useVaultWebSocket.ts';
import { subscribeLocalNoteRemoved } from './local-note-events.ts';
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
        setReloadKey((value) => {
          const next = value + 1;
          pushLiveE2eLog({ kind: 'reloadKey', noteId, reloadKey: next, eventType: event.type });
          return next;
        });
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

  useEffect(() => {
    return subscribeLocalNoteRemoved((detail) => {
      if (noteId === null) {
        return;
      }
      if (detail.noteId === noteId || detail.path === noteId) {
        setDeleted(true);
      }
    });
  }, [noteId]);

  return { reloadKey, deleted };
}
