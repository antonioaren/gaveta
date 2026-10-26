import { useCallback, useState } from 'react';
import { fetchNoteHtml } from '../api/note-read.ts';
import type { VaultNoteEvent } from '../live/vault-events.ts';
import { useVaultWebSocket } from '../live/useVaultWebSocket.ts';

export interface ExternalNoteRevision {
  readonly hash: string;
  readonly html: string;
}

export function useExternalNoteRevision(
  noteRef: string | null,
  noteId: string | null,
  baselineHash: string | null,
): {
  readonly external: ExternalNoteRevision | null;
  readonly clearExternal: () => void;
} {
  const [external, setExternal] = useState<ExternalNoteRevision | null>(null);

  const refreshExternal = useCallback(async () => {
    if (noteRef === null || baselineHash === null) {
      return;
    }
    try {
      const disk = await fetchNoteHtml(noteRef);
      if (disk.hash === baselineHash) {
        setExternal(null);
        return;
      }
      setExternal({ hash: disk.hash, html: disk.html });
    } catch {
      /* ignore transient read errors */
    }
  }, [baselineHash, noteRef]);

  const onEvent = useCallback(
    (event: VaultNoteEvent) => {
      if (noteId === null || event.id !== noteId) {
        return;
      }
      if (
        event.type === 'note:changed' ||
        event.type === 'note:moved' ||
        event.type === 'note:added'
      ) {
        void refreshExternal();
      }
    },
    [noteId, refreshExternal],
  );
  useVaultWebSocket(onEvent);

  return {
    external,
    clearExternal: () => {
      setExternal(null);
    },
  };
}
