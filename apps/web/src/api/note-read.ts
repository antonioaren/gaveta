import { apiJson } from './client.ts';

export interface NoteHtmlRead {
  readonly id: string;
  readonly path: string;
  readonly title: string;
  readonly type: string;
  readonly hash: string;
  readonly html: string;
}

export async function fetchNoteHtml(ref: string): Promise<NoteHtmlRead> {
  const envelope = await apiJson<NoteHtmlRead>(`/api/read?ref=${encodeURIComponent(ref)}&as=html`);
  return envelope.data;
}
