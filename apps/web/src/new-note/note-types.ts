export const CREATE_NOTE_TYPES = [
  'doc',
  'slides',
  'todo',
  'dashboard',
  'design',
  'artifact',
] as const;

export type CreateNoteType = (typeof CREATE_NOTE_TYPES)[number];
