import { useCallback, useMemo, useState, type ReactNode } from 'react';
import {
  NewNoteDialogContext,
  type NewNoteDraft,
  type NewNoteDialogContextValue,
} from './new-note-dialog-context-state.ts';

export function NewNoteDialogProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [draft, setDraft] = useState<NewNoteDraft | null>(null);

  const openNewNote = useCallback((next?: NewNoteDraft) => {
    setDraft(next ?? {});
    setIsOpen(true);
  }, []);

  const closeNewNote = useCallback(() => {
    setIsOpen(false);
    setDraft(null);
  }, []);

  const value = useMemo<NewNoteDialogContextValue>(
    () => ({
      isOpen,
      draft,
      openNewNote,
      closeNewNote,
    }),
    [isOpen, draft, openNewNote, closeNewNote],
  );

  return <NewNoteDialogContext.Provider value={value}>{children}</NewNoteDialogContext.Provider>;
}
