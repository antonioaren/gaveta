import { formatMessage } from '@gaveta/i18n';
import { useEffect, useState } from 'react';
import { apiJson } from '../api/client.ts';
import { readWebLocale } from '../i18n/read-web-locale.ts';
import type { SearchHitView, SearchResponse } from '../api/types.ts';
import { subscribeVaultNoteLiveRefresh } from '../connections/connections-refresh.ts';

const DEBOUNCE_MS = 250;

export interface PaletteSearchState {
  readonly hits: readonly SearchHitView[];
  readonly loading: boolean;
  readonly error: string | null;
}

const IDLE: PaletteSearchState = { hits: [], loading: false, error: null };

export function usePaletteSearch(query: string, enabled: boolean): PaletteSearchState {
  const trimmed = query.trim();
  const [state, setState] = useState<PaletteSearchState>(IDLE);
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    return subscribeVaultNoteLiveRefresh(() => {
      setRefreshToken((value) => value + 1);
    });
  }, [enabled]);

  useEffect(() => {
    if (!enabled || trimmed.length === 0) {
      return;
    }

    const controller = new AbortController();
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        setState({ hits: [], loading: true, error: null });
        try {
          const envelope = await apiJson<SearchResponse>(
            `/api/search?q=${encodeURIComponent(trimmed)}&limit=20`,
            { signal: controller.signal },
          );
          if (!cancelled) {
            setState({ hits: envelope.data.hits, loading: false, error: null });
          }
        } catch (cause: unknown) {
          if (cancelled || isAbortError(cause)) {
            return;
          }
          const message =
            cause instanceof Error
              ? cause.message
              : formatMessage('web.api.error.fallbackSearch', readWebLocale());
          setState({ hits: [], loading: false, error: message });
        }
      })();
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [trimmed, enabled, refreshToken]);

  if (!enabled || trimmed.length === 0) {
    return IDLE;
  }

  return state;
}

function isAbortError(cause: unknown): boolean {
  return cause instanceof DOMException && cause.name === 'AbortError';
}
