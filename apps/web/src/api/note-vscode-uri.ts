import { apiJson } from './client.ts';

export interface NoteVsCodeUriResponse {
  readonly uri: string;
}

export async function fetchNoteVsCodeUri(noteRef: string): Promise<NoteVsCodeUriResponse> {
  const params = new URLSearchParams({ ref: noteRef });
  const envelope = await apiJson<NoteVsCodeUriResponse>(
    `/api/note/vscode-uri?${params.toString()}`,
  );
  return envelope.data;
}
