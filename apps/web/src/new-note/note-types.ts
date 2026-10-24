export const CREATE_NOTE_TYPES = [
  'doc',
  'slides',
  'todo',
  'dashboard',
  'design',
  'artifact',
] as const;

export type CreateNoteType = (typeof CREATE_NOTE_TYPES)[number];

export const CREATE_NOTE_TYPE_LABELS: Record<CreateNoteType, string> = {
  doc: 'Documento',
  slides: 'Presentación',
  todo: 'Tareas',
  dashboard: 'Panel',
  design: 'Diseño',
  artifact: 'Artefacto',
};
