import { useCallback, useEffect, useState } from 'react';
import { apiJson } from '../api/client.ts';
import { messageFromCaught } from '../i18n/api-error-message.ts';
import type { NoteListItem, NotesResponse } from '../api/types.ts';
import { useVaultWebSocket } from '../live/useVaultWebSocket.ts';
import { subscribeVaultAuthFailure, subscribeVaultReconnect } from '../live/vault-socket-hub.ts';

export function useVaultNotes(): {
  readonly notes: readonly NoteListItem[];
  readonly loading: boolean;
  readonly error: string | null;
  readonly liveError: string | null;
  readonly reload: () => void;
} {
  const [notes, setNotes] = useState<readonly NoteListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);
  const [liveError, setLiveError] = useState<string | null>(null);

  const reload = useCallback(() => {
    setRefreshToken((value) => value + 1);
  }, []);

  useVaultWebSocket(reload);

  useEffect(() => {
    return subscribeVaultReconnect(reload);
  }, [reload]);

  useEffect(() => {
    return subscribeVaultAuthFailure((message) => {
      setLiveError(message);
    });
  }, []);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const envelope = await apiJson<NotesResponse>('/api/notes');
        setNotes(envelope.data.notes);
      } catch (caught) {
        const message = messageFromCaught(caught, 'web.api.error.fallbackLoadNotes');
        setError(message);
      } finally {
        setLoading(false);
      }
    })();
  }, [refreshToken]);

  return { notes, loading, error, liveError, reload };
}
