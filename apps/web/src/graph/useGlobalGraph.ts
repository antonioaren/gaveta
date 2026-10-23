import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiJson } from '../api/client.ts';
import type { GraphResponse } from '../api/types.ts';
import { subscribeConnectionsRefresh } from '../connections/connections-refresh.ts';
import { type GraphFilterState, buildGraphApiPath } from './filter-graph.ts';

function serverFilters(filters: GraphFilterState): GraphFilterState {
  return {
    type: filters.type,
    tag: filters.tag,
    rel: filters.rel,
    folder: filters.folder,
    hideOrphans: false,
    showTagNodes: false,
  };
}

export function useGlobalGraph(filters: GraphFilterState): {
  readonly graph: GraphResponse | null;
  readonly loading: boolean;
  readonly error: string | null;
} {
  const [graph, setGraph] = useState<GraphResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const apiPath = useMemo(() => buildGraphApiPath(serverFilters(filters)), [filters]);

  const reload = useCallback(() => {
    setReloadToken((value) => value + 1);
  }, []);

  useEffect(
    () =>
      subscribeConnectionsRefresh(() => {
        reload();
      }),
    [reload],
  );

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const envelope = await apiJson<GraphResponse>(apiPath, {
          signal: controller.signal,
        });
        setGraph(envelope.data);
      } catch (cause: unknown) {
        if (cause instanceof DOMException && cause.name === 'AbortError') {
          return;
        }
        const message =
          cause instanceof Error ? cause.message : 'No se pudo cargar el grafo global';
        setError(message);
        setGraph(null);
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    })();
    return () => {
      controller.abort();
    };
  }, [apiPath, reloadToken]);

  return { graph, loading, error };
}
