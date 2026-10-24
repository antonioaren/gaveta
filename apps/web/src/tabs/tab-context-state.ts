import { createContext } from 'react';

export interface ViewerTab {
  readonly id: string;
  readonly ref: string;
  readonly path: string;
  readonly title: string;
  /** Indexed ULID for render tickets; null when the note cannot be previewed yet. */
  readonly noteId: string | null;
}

export interface TabContextValue {
  readonly tabs: readonly ViewerTab[];
  readonly activeTabId: string | null;
  openTab(ref: string, title: string, path: string, noteId: string | null): void;
  closeTab(tabId: string): void;
  activateTab(tabId: string): void;
  remapNotePath(fromPath: string, toPath: string, noteId: string | null, title?: string): void;
}

export const TabContext = createContext<TabContextValue | null>(null);
