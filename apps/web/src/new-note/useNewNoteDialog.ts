import { useContext } from 'react';
import {
  NewNoteDialogContext,
  type NewNoteDialogContextValue,
} from './new-note-dialog-context-state.ts';

export function useNewNoteDialog(): NewNoteDialogContextValue {
  const value = useContext(NewNoteDialogContext);
  if (value === null) {
    throw new Error('useNewNoteDialog must be used within NewNoteDialogProvider');
  }
  return value;
}
