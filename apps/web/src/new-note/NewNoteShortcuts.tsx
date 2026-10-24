import { useEffect } from 'react';
import { useNewNoteDialog } from './useNewNoteDialog.ts';

export function NewNoteShortcuts() {
  const { openNewNote, isOpen, closeNewNote } = useNewNoteDialog();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if ((event.metaKey || event.ctrlKey) && event.altKey && key === 'n') {
        event.preventDefault();
        if (isOpen) {
          closeNewNote();
        } else {
          openNewNote();
        }
        return;
      }
      if (key === 'escape' && isOpen) {
        event.preventDefault();
        closeNewNote();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [openNewNote, closeNewNote, isOpen]);

  return null;
}
