import { apiJson } from './client.ts';

interface ReadHtmlResponse {
  readonly hash: string;
}

export async function fetchNoteContentHash(ref: string): Promise<string> {
  const envelope = await apiJson<ReadHtmlResponse>(
    `/api/read?ref=${encodeURIComponent(ref)}&as=html`,
  );
  return envelope.data.hash;
}
