export interface ApiEnvelope<T> {
  readonly ok: boolean;
  readonly schemaVersion: number;
  readonly data: T;
  readonly warnings?: readonly unknown[];
}

export interface NoteListItem {
  readonly id: string | null;
  readonly path: string;
  readonly title: string;
  readonly type: 'doc' | 'slides' | 'todo' | null;
  readonly tags: readonly string[];
  readonly aliases: readonly string[];
}

export interface NotesResponse {
  readonly notes: readonly NoteListItem[];
}
