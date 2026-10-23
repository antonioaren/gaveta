import { useCallback, useEffect, useState } from 'react';
import { apiJson } from '../api/client.ts';
import type { BacklinksResponse, GraphResponse, LinksResponse } from '../api/types.ts';
import { subscribeConnectionsRefresh } from '../connections/connections-refresh.ts';

export interface ConnectionsData {
  readonly links: LinksResponse | null;
  readonly backlinks: BacklinksResponse | null;
  readonly graph: GraphResponse | null;
  readonly loading: boolean;
  readonly error: string | null;
  readonly reload: () => void;
}

const EMPTY_CONNECTIONS: ConnectionsData = {
  links: null,
  backlinks: null,
  graph: null,
  loading: false,
  error: null,
  reload: () => undefined,
};

export function useConnectionsData(ref: string | null): ConnectionsData {
  const [links, setLinks] = useState<LinksResponse | null>(null);
  const [backlinks, setBacklinks] = useState<BacklinksResponse | null>(null);
  const [graph, setGraph] = useState<GraphResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const reload = useCallback(() => {
    setReloadToken((value) => value + 1);
  }, []);

  useEffect(() => {
    return subscribeConnectionsRefresh(() => {
      reload();
    });
  }, [reload]);

  useEffect(() => {
    if (ref === null) {
      return;
    }
    void (async () => {
      setLoading(true);
      setError(null);
      const encoded = encodeURIComponent(ref);
      try {
        const [linksEnvelope, backlinksEnvelope, graphEnvelope] = await Promise.all([
          apiJson<LinksResponse>(`/api/links?ref=${encoded}`),
          apiJson<BacklinksResponse>(`/api/backlinks?ref=${encoded}`),
          apiJson<GraphResponse>(`/api/graph?ref=${encoded}&depth=1`),
        ]);
        setLinks(linksEnvelope.data);
        setBacklinks(backlinksEnvelope.data);
        setGraph(graphEnvelope.data);
      } catch (cause: unknown) {
        const message =
          cause instanceof Error ? cause.message : 'No se pudieron cargar las conexiones';
        setError(message);
        setLinks(null);
        setBacklinks(null);
        setGraph(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [ref, reloadToken]);

  if (ref === null) {
    return { ...EMPTY_CONNECTIONS, reload };
  }

  return { links, backlinks, graph, loading, error, reload };
}
