import { useContext } from 'react';
import { TabContext } from './tab-context-state.ts';

export function useTabs() {
  const value = useContext(TabContext);
  if (value === null) {
    throw new Error('useTabs must be used within TabProvider');
  }
  return value;
}
