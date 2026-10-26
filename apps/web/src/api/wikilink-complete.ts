import { apiJson } from './client.ts';
export interface WikilinkCompletionView {
  readonly id: string | null;
  readonly title: string;
  readonly path: string;
  readonly matchedBy: 'title' | 'alias';
  readonly matchedLabel: string;
  readonly score: number;
}

export interface WikilinkCompleteResponse {
  readonly query: string;
  readonly limit: number;
  readonly hits: readonly WikilinkCompletionView[];
}

export async function fetchWikilinkCompletions(
  query: string,
  limit = 20,
): Promise<readonly WikilinkCompletionView[]> {
  const params = new URLSearchParams();
  params.set('q', query);
  params.set('limit', String(limit));
  const envelope = await apiJson<WikilinkCompleteResponse>(
    `/api/wikilink-complete?${params.toString()}`,
  );
  return envelope.data.hits;
}
