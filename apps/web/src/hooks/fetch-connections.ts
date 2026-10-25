import { apiJson } from '../api/client.ts';
import type {
  BacklinksResponse,
  GraphResponse,
  LinksResponse,
  MentionsResponse,
} from '../api/types.ts';

export interface ConnectionsBundle {
  readonly links: LinksResponse;
  readonly backlinks: BacklinksResponse;
  readonly mentions: MentionsResponse;
  readonly graph: GraphResponse;
}

export async function fetchConnectionsBundle(
  ref: string,
  signal?: AbortSignal,
): Promise<ConnectionsBundle> {
  const encoded = encodeURIComponent(ref);
  const init: RequestInit = signal === undefined ? {} : { signal };
  const [linksEnvelope, backlinksEnvelope, mentionsEnvelope, graphEnvelope] = await Promise.all([
    apiJson<LinksResponse>(`/api/links?ref=${encoded}`, init),
    apiJson<BacklinksResponse>(`/api/backlinks?ref=${encoded}`, init),
    apiJson<MentionsResponse>(`/api/mentions?ref=${encoded}`, init),
    apiJson<GraphResponse>(`/api/graph?ref=${encoded}&depth=1`, init),
  ]);
  return {
    links: linksEnvelope.data,
    backlinks: backlinksEnvelope.data,
    mentions: mentionsEnvelope.data,
    graph: graphEnvelope.data,
  };
}
