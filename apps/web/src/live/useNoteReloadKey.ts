import { useCallback, useState } from 'react';
import { useVaultWebSocket } from './useVaultWebSocket.ts';

export function useNoteReloadKey(noteId: string | null): number {
  const [reloadKey, setReloadKey] = useState(0);
  const onEvent = useCallback(
    (event: { readonly type: string; readonly id: string | null }) => {
      if (noteId === null || event.id !== noteId) {
        return;
      }
      if (event.type === 'note:changed' || event.type === 'note:moved') {
        setReloadKey((value) => value + 1);
      }
    },
    [noteId],
  );
  useVaultWebSocket(onEvent);
  return reloadKey;
}
