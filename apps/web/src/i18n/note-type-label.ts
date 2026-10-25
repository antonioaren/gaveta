import type { MessageKey } from '@gaveta/i18n';
import type { CreateNoteType } from '../new-note/note-types.ts';

const NOTE_TYPE_KEYS: Record<CreateNoteType, MessageKey> = {
  doc: 'web.noteType.doc',
  slides: 'web.noteType.slides',
  todo: 'web.noteType.todo',
  dashboard: 'web.noteType.dashboard',
  design: 'web.noteType.design',
  artifact: 'web.noteType.artifact',
};

export function noteTypeMessageKey(type: CreateNoteType): MessageKey {
  return NOTE_TYPE_KEYS[type];
}

export function noteTypeMessageKeyForFilter(type: string): MessageKey | null {
  if (type in NOTE_TYPE_KEYS) {
    return NOTE_TYPE_KEYS[type as CreateNoteType];
  }
  return null;
}
