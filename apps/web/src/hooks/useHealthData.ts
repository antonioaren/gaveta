import { useCallback, useEffect, useRef, useState } from 'react';
import { apiJson } from '../api/client.ts';
import { messageFromCaught } from '../i18n/api-error-message.ts';
import { subscribeVaultNoteLiveRefresh } from '../connections/connections-refresh.ts';
import type { DoctorResponse } from '../health/health-types.ts';

export interface HealthData {
  readonly report: DoctorResponse | null;
  readonly loading: boolean;
  readonly error: string | null;
  readonly externalChangeNotice: boolean;
  readonly reload: () => void;
  readonly dismissExternalNotice: () => void;
}

const LIVE_DEBOUNCE_MS = 400;

export function useHealthData(): HealthData {
  const [report, setReport] = useState<DoctorResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [externalChangeNotice, setExternalChangeNotice] = useState(false);
  const previousFindingCountRef = useRef<number | null>(null);
  const pendingLiveReloadRef = useRef(false);

  const reload = useCallback(() => {
    setReloadToken((value) => value + 1);
  }, []);

  const dismissExternalNotice = useCallback(() => {
    setExternalChangeNotice(false);
  }, []);

  useEffect(() => {
    let disposed = false;
    let debounceTimer: ReturnType<typeof setTimeout> | undefined;
    let abortController: AbortController | undefined;
    let generation = 0;
    let inFlight = false;
    let queuedRerun = false;

    const runFetch = async (): Promise<void> => {
      const fetchGeneration = ++generation;
      abortController?.abort();
      abortController = new AbortController();
      const signal = abortController.signal;

      setLoading(true);
      setError(null);
      try {
        const envelope = await apiJson<DoctorResponse>('/api/doctor', { signal });
        if (disposed || fetchGeneration !== generation) {
          return;
        }
        const next = envelope.data;
        const previousCount = previousFindingCountRef.current;
        if (
          pendingLiveReloadRef.current &&
          previousCount !== null &&
          next.findings.length > previousCount
        ) {
          setExternalChangeNotice(true);
        }
        pendingLiveReloadRef.current = false;
        previousFindingCountRef.current = next.findings.length;
        setReport(next);
      } catch (cause: unknown) {
        if (disposed || fetchGeneration !== generation || isAbortError(cause)) {
          return;
        }
        const message = messageFromCaught(cause, 'web.api.error.fallbackLoadHealth');
        setError(message);
        setReport(null);
      } finally {
        if (!disposed && fetchGeneration === generation) {
          setLoading(false);
        }
      }
    };

    const startFetch = (): void => {
      if (inFlight) {
        queuedRerun = true;
        return;
      }
      inFlight = true;
      void runFetch().finally(() => {
        inFlight = false;
        if (!disposed && queuedRerun) {
          queuedRerun = false;
          startFetch();
        }
      });
    };

    const scheduleLiveFetch = (): void => {
      pendingLiveReloadRef.current = true;
      if (debounceTimer !== undefined) {
        clearTimeout(debounceTimer);
      }
      debounceTimer = setTimeout(() => {
        debounceTimer = undefined;
        startFetch();
      }, LIVE_DEBOUNCE_MS);
    };

    startFetch();

    const unsubscribeLive = subscribeVaultNoteLiveRefresh(scheduleLiveFetch);

    return () => {
      disposed = true;
      unsubscribeLive();
      if (debounceTimer !== undefined) {
        clearTimeout(debounceTimer);
      }
      abortController?.abort();
    };
  }, [reloadToken]);

  return {
    report,
    loading,
    error,
    externalChangeNotice,
    reload,
    dismissExternalNotice,
  };
}

function isAbortError(cause: unknown): boolean {
  return cause instanceof DOMException && cause.name === 'AbortError';
}
