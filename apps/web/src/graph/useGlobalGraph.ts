import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiJson } from '../api/client.ts';
import { messageFromCaught } from '../i18n/api-error-message.ts';
import type { GraphResponse } from '../api/types.ts';
import { subscribeVaultNoteLiveRefresh } from '../connections/connections-refresh.ts';
import { type GraphFilterState, buildGraphApiPath } from './filter-graph.ts';

const LIVE_REFRESH_DEBOUNCE_MS = 250;

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

function isAbortError(cause: unknown): boolean {
  return cause instanceof DOMException && cause.name === 'AbortError';
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

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const scheduleReload = (): void => {
      if (timer !== undefined) {
        clearTimeout(timer);
      }
      timer = setTimeout(() => {
        timer = undefined;
        reload();
      }, LIVE_REFRESH_DEBOUNCE_MS);
    };
    const unsubscribe = subscribeVaultNoteLiveRefresh(scheduleReload);
    return () => {
      if (timer !== undefined) {
        clearTimeout(timer);
      }
      unsubscribe();
    };
  }, [reload]);

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const envelope = await apiJson<GraphResponse>(apiPath, { signal });
        if (!signal.aborted) {
          setGraph(envelope.data);
        }
      } catch (cause: unknown) {
        if (isAbortError(cause)) {
          return;
        }
        const message = messageFromCaught(cause, 'web.api.error.fallbackLoadGraph');
        if (!signal.aborted) {
          setError(message);
          setGraph(null);
        }
      } finally {
        if (!signal.aborted) {
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
