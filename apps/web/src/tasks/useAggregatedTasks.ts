import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiJson } from '../api/client.ts';
import type { TasksResponse } from '../api/types.ts';
import { messageFromCaught } from '../i18n/api-error-message.ts';
import { subscribeVaultNoteLiveRefresh } from '../connections/connections-refresh.ts';
import { buildTasksApiPath, type TaskViewFilters } from './build-tasks-api-path.ts';

const LIVE_REFRESH_DEBOUNCE_MS = 250;

function isAbortError(cause: unknown): boolean {
  return cause instanceof DOMException && cause.name === 'AbortError';
}

export function useAggregatedTasks(filters: TaskViewFilters): {
  readonly tasks: TasksResponse['tasks'];
  readonly loading: boolean;
  readonly error: string | null;
} {
  const [tasks, setTasks] = useState<TasksResponse['tasks']>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const apiPath = useMemo(() => buildTasksApiPath(filters), [filters]);

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
        const envelope = await apiJson<TasksResponse>(apiPath, { signal });
        if (!signal.aborted) {
          setTasks(envelope.data.tasks);
        }
      } catch (cause: unknown) {
        if (isAbortError(cause)) {
          return;
        }
        const message = messageFromCaught(cause, 'web.api.error.fallbackGeneric');
        if (!signal.aborted) {
          setError(message);
          setTasks([]);
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

  return { tasks, loading, error };
}
