import { useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { isNoteUlid } from '../notes/viewer-ref.ts';
import { useTabs } from '../tabs/useTabs.ts';

export interface ActiveViewerRef {
  readonly ref: string | null;
  readonly noteId: string | null;
  readonly title: string | null;
  readonly path: string | null;
}

export function useActiveViewerRef(): ActiveViewerRef {
  const { ref: encodedRef } = useParams();
  const { tabs, activeTabId } = useTabs();

  return useMemo(() => {
    if (encodedRef !== undefined) {
      const ref = decodeURIComponent(encodedRef);
      const tab = tabs.find((entry) => entry.ref === ref);
      const noteId = isNoteUlid(ref) ? ref : (tab?.noteId ?? null);
      return {
        ref,
        noteId,
        title: tab?.title ?? ref,
        path: tab?.path ?? ref,
      };
    }
    const tab = tabs.find((entry) => entry.id === activeTabId) ?? null;
    if (tab === null) {
      return { ref: null, noteId: null, title: null, path: null };
    }
    return {
      ref: tab.ref,
      noteId: tab.noteId,
      title: tab.title,
      path: tab.path,
    };
  }, [encodedRef, tabs, activeTabId]);
}
