import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { TabContext, type TabContextValue, type ViewerTab } from './tab-context-state.ts';

function tabIdForRef(ref: string): string {
  return ref;
}

export function TabProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const [tabs, setTabs] = useState<ViewerTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);

  const openTab = useCallback(
    (ref: string, title: string, path: string, noteId: string | null) => {
      const id = tabIdForRef(ref);
      setTabs((current) => {
        const existing = current.find((tab) => tab.id === id);
        if (existing !== undefined) {
          return current;
        }
        return [...current, { id, ref, path, title, noteId }];
      });
      setActiveTabId(id);
      void navigate(`/nota/${encodeURIComponent(ref)}`);
    },
    [navigate],
  );

  const closeTab = useCallback(
    (tabId: string) => {
      setTabs((current) => {
        const next = current.filter((tab) => tab.id !== tabId);
        if (activeTabId === tabId) {
          const fallback = next[next.length - 1];
          if (fallback !== undefined) {
            setActiveTabId(fallback.id);
            void navigate(`/nota/${encodeURIComponent(fallback.ref)}`);
          } else {
            setActiveTabId(null);
            void navigate('/');
          }
        }
        return next;
      });
    },
    [activeTabId, navigate],
  );

  const activateTab = useCallback(
    (tabId: string) => {
      const tab = tabs.find((entry) => entry.id === tabId);
      if (tab === undefined) {
        return;
      }
      setActiveTabId(tabId);
      void navigate(`/nota/${encodeURIComponent(tab.ref)}`);
    },
    [navigate, tabs],
  );

  const remapNotePath = useCallback(
    (fromPath: string, toPath: string, noteId: string | null, title?: string) => {
      setTabs((current) =>
        current.map((tab) => {
          const matches =
            tab.path === fromPath ||
            (noteId !== null && (tab.ref === noteId || tab.noteId === noteId));
          if (!matches) {
            return tab;
          }
          const ref = noteId ?? toPath;
          return {
            ...tab,
            id: ref,
            ref,
            path: toPath,
            title: title ?? tab.title,
            noteId,
          };
        }),
      );
    },
    [],
  );

  const value = useMemo<TabContextValue>(
    () => ({
      tabs,
      activeTabId,
      openTab,
      closeTab,
      activateTab,
      remapNotePath,
    }),
    [tabs, activeTabId, openTab, closeTab, activateTab, remapNotePath],
  );

  return <TabContext.Provider value={value}>{children}</TabContext.Provider>;
}
