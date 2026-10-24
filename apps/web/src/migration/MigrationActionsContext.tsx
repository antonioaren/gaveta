import { createContext, useContext } from 'react';
import type { ExportMarkdownTarget } from './ExportMarkdownDialog.tsx';

export interface MigrationActions {
  readonly openImportPicker: () => void;
  readonly openExport: (target: ExportMarkdownTarget) => void;
}

export const MigrationActionsContext = createContext<MigrationActions | null>(null);

export function useMigrationActions(): MigrationActions {
  const value = useContext(MigrationActionsContext);
  if (value === null) {
    throw new Error('MigrationActionsContext missing');
  }
  return value;
}
