import { useCallback, useEffect, useState } from 'react';
import type {
  BacklinksResponse,
  GraphResponse,
  LinksResponse,
  MentionsResponse,
} from '../api/types.ts';
import { subscribeConnectionsRefresh } from '../connections/connections-refresh.ts';
import { messageFromCaught } from '../i18n/api-error-message.ts';
import { fetchConnectionsBundle } from './fetch-connections.ts';

export interface ConnectionsData {
  readonly links: LinksResponse | null;
  readonly backlinks: BacklinksResponse | null;
  readonly mentions: MentionsResponse | null;
  readonly graph: GraphResponse | null;
  readonly loading: boolean;
  readonly error: string | null;
  readonly reload: () => void;
}

const EMPTY_CONNECTIONS: ConnectionsData = {
  links: null,
  backlinks: null,
  mentions: null,
  graph: null,
  loading: false,
  error: null,
  reload: () => undefined,
};

export function useConnectionsData(ref: string | null): ConnectionsData {
  const [links, setLinks] = useState<LinksResponse | null>(null);
  const [backlinks, setBacklinks] = useState<BacklinksResponse | null>(null);
  const [mentions, setMentions] = useState<MentionsResponse | null>(null);
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
    const controller = new AbortController();
    const cancelledRef = { current: false };
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const bundle = await fetchConnectionsBundle(ref, controller.signal);
        if (cancelledRef.current) {
          return;
        }
        setLinks(bundle.links);
        setBacklinks(bundle.backlinks);
        setMentions(bundle.mentions);
        setGraph(bundle.graph);
      } catch (cause: unknown) {
        if (cancelledRef.current || isAbortError(cause)) {
          return;
        }
        const message = messageFromCaught(cause, 'web.api.error.fallbackLoadConnections');
        setError(message);
        setLinks(null);
        setBacklinks(null);
        setMentions(null);
        setGraph(null);
      } finally {
        if (!cancelledRef.current) {
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelledRef.current = true;
      controller.abort();
    };
  }, [ref, reloadToken]);

  if (ref === null) {
    return { ...EMPTY_CONNECTIONS, reload };
  }

  return { links, backlinks, mentions, graph, loading, error, reload };
}

function isAbortError(cause: unknown): boolean {
  return cause instanceof DOMException && cause.name === 'AbortError';
}
