import { createContext } from 'react';

export interface ViewerTab {
  readonly id: string;
  readonly ref: string;
  readonly title: string;
}

export interface TabContextValue {
  readonly tabs: readonly ViewerTab[];
  readonly activeTabId: string | null;
  openTab(ref: string, title: string): void;
  closeTab(tabId: string): void;
  activateTab(tabId: string): void;
}

export const TabContext = createContext<TabContextValue | null>(null);
