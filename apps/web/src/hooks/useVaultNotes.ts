import { useEffect, useState } from 'react';
import { apiJson } from '../api/client.ts';
import type { NoteListItem, NotesResponse } from '../api/types.ts';

export function useVaultNotes(): {
  readonly notes: readonly NoteListItem[];
  readonly loading: boolean;
  readonly error: string | null;
} {
  const [notes, setNotes] = useState<readonly NoteListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const envelope = await apiJson<NotesResponse>('/api/notes');
        setNotes(envelope.data.notes);
      } catch (caught) {
        const message =
          caught instanceof Error ? caught.message : 'No se pudieron cargar las notas';
        setError(message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return { notes, loading, error };
}
