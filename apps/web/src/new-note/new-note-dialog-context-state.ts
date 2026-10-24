import { createContext } from 'react';

export interface NewNoteDraft {
  readonly title?: string;
  readonly type?: string;
  readonly folder?: string;
  /** When set, this viewer tab ref is closed after a successful create. */
  readonly replaceTabRef?: string;
}

export interface NewNoteDialogContextValue {
  readonly isOpen: boolean;
  readonly draft: NewNoteDraft | null;
  readonly openNewNote: (draft?: NewNoteDraft) => void;
  readonly closeNewNote: () => void;
}

export const NewNoteDialogContext = createContext<NewNoteDialogContextValue | null>(null);
