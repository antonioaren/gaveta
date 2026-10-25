import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { isNoteUlid } from '../notes/viewer-ref.ts';
import { ApiError } from '../api/client.ts';
import { messageFromCaught } from '../i18n/api-error-message.ts';
import { fetchNoteContentHash } from '../api/note-hash.ts';
import { todoSetChecked } from '../api/todo-write.ts';
import type { useTabs } from '../tabs/useTabs.ts';
import { isGavetaNavigateMessage } from './navigate-message.ts';
import { sendTaskCheckedToRenderIframe } from './send-task-checked.ts';
import { parseGavetaTaskToggleMessage } from './task-toggle-message.ts';

type TabState = ReturnType<typeof useTabs>;

export function useRenderBridgeHost(options: {
  readonly iframeWindowRef: RefObject<Window | null>;
  readonly noteRef: string | null;
  readonly tabState: TabState;
}): { readonly taskError: string | null } {
  const { iframeWindowRef, noteRef, tabState } = options;
  const [taskErrorState, setTaskErrorState] = useState<{
    readonly noteRef: string;
    readonly message: string;
  } | null>(null);
  const taskError =
    noteRef !== null && taskErrorState?.noteRef === noteRef ? taskErrorState.message : null;
  const hashRef = useRef<string | null>(null);
  const mutationChainRef = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    hashRef.current = null;
  }, [noteRef]);

  const persistTaskToggle = useCallback(
    (taskId: string, checked: boolean, previousChecked: boolean) => {
      if (noteRef === null) {
        return;
      }
      const iframeWindow = iframeWindowRef.current;
      mutationChainRef.current = mutationChainRef.current
        .then(async () => {
          setTaskErrorState(null);
          const ifMatch = hashRef.current ?? (await fetchNoteContentHash(noteRef));
          try {
            const result = await todoSetChecked(noteRef, taskId, checked, ifMatch);
            hashRef.current = result.hash;
          } catch (error) {
            if (iframeWindow !== null) {
              sendTaskCheckedToRenderIframe(iframeWindow, taskId, previousChecked);
            }
            if (error instanceof ApiError && error.code === 'E_CONFLICT') {
              const nextHash = error.details?.hash;
              if (typeof nextHash === 'string' && nextHash.length > 0) {
                hashRef.current = nextHash;
              }
            }
            const message =
              error instanceof ApiError
                ? error.message
                : messageFromCaught(error, 'web.api.error.fallbackTaskUpdate');
            setTaskErrorState({ noteRef, message });
          }
        })
        .catch(() => {
          /* chain must stay alive */
        });
    },
    [iframeWindowRef, noteRef],
  );

  useEffect(() => {
    const onMessage = (event: MessageEvent): void => {
      if (event.source !== iframeWindowRef.current) {
        return;
      }
      if (isGavetaNavigateMessage(event.data)) {
        const ref = event.data.ref;
        const noteId = isNoteUlid(ref) ? ref : null;
        tabState.openTab(ref, ref, ref, noteId);
        return;
      }
      const toggle = parseGavetaTaskToggleMessage(event.data);
      if (toggle === null) {
        return;
      }
      if (noteRef === null) {
        return;
      }
      persistTaskToggle(toggle.taskId, toggle.checked, !toggle.checked);
    };
    window.addEventListener('message', onMessage);
    return () => {
      window.removeEventListener('message', onMessage);
    };
  }, [iframeWindowRef, noteRef, persistTaskToggle, tabState]);

  return { taskError };
}
