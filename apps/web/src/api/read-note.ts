import { apiJson } from './client.ts';

export interface ReadNotePayload {
  readonly hash: string;
  readonly title: string;
  readonly path: string;
}

export async function fetchNoteRead(ref: string): Promise<ReadNotePayload> {
  const envelope = await apiJson<ReadNotePayload>(
    `/api/read?ref=${encodeURIComponent(ref)}&as=html`,
  );
  return envelope.data;
}
