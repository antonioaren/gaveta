import { useLocation } from 'react-router-dom';
import { GlobalGraphView } from '../graph/GlobalGraphView.tsx';
import { AggregatedTasksView } from '../tasks/AggregatedTasksView.tsx';
import { ConnectionsPanel } from '../connections/ConnectionsPanel.tsx';
import { HealthPanel } from '../health/HealthPanel.tsx';
import { NoteExplorer } from '../explorer/NoteExplorer.tsx';
import { useVaultNotes } from '../hooks/useVaultNotes.ts';
import { NotePane } from '../note/NotePane.tsx';
import { TabBar } from '../tabs/TabBar.tsx';
import { SearchPaletteHost } from '../search/SearchPalette.tsx';
import { SearchPaletteProvider } from '../search/SearchPaletteProvider.tsx';
import { NewNoteDialog } from '../new-note/NewNoteDialog.tsx';
import { NewNoteDialogProvider } from '../new-note/NewNoteDialogProvider.tsx';
import { NewNoteShortcuts } from '../new-note/NewNoteShortcuts.tsx';
import { TabProvider } from '../tabs/TabContext.tsx';
import { NoteOpsHost } from '../note-ops/NoteOpsHost.tsx';
import { MigrationHost } from '../migration/MigrationHost.tsx';
import type { NoteListItem } from '../api/types.ts';
import { ShellTopbar } from './ShellTopbar.tsx';
import { useMigrationActions } from '../migration/MigrationActionsContext.tsx';

export function ShellLayout() {
  const vault = useVaultNotes();
  return (
    <TabProvider>
      <MigrationHost onVaultChanged={vault.reload}>
        <ShellLayoutBody
          notes={vault.notes}
          loading={vault.loading}
          error={vault.error}
          liveError={vault.liveError}
          reload={vault.reload}
        />
      </MigrationHost>
    </TabProvider>
  );
}

function ShellLayoutBody({
  notes,
  loading,
  error,
  liveError,
  reload,
}: {
  readonly notes: readonly NoteListItem[];
  readonly loading: boolean;
  readonly error: string | null;
  readonly liveError: string | null;
  readonly reload: () => void;
}) {
  const migration = useMigrationActions();
  const location = useLocation();
  const graphMode = location.pathname === '/grafo';
  const tasksMode = location.pathname === '/tareas';

  return (
    <NewNoteDialogProvider>
      <NewNoteShortcuts />
      <NewNoteDialog notes={notes} />
      <NoteOpsHost notes={notes} onRefreshNotes={reload}>
        {(openNoteOp) => (
          <SearchPaletteProvider>
            <SearchPaletteHost />
            <div className="shell">
              <ShellTopbar />
              <TabBar />
              {graphMode ? (
                <main className="shell__main shell__main--graph">
                  <GlobalGraphView />
                </main>
              ) : tasksMode ? (
                <main className="shell__main shell__main--tasks">
                  <AggregatedTasksView />
                </main>
              ) : (
                <div className="shell__columns">
                  <NoteExplorer
                    notes={notes}
                    loading={loading}
                    error={liveError ?? error}
                    onNoteOp={openNoteOp}
                    onExportFolder={(folderPath, label) => {
                      migration.openExport({ kind: 'folder', ref: folderPath, label });
                    }}
                    onExportNote={(ref, label) => {
                      migration.openExport({ kind: 'note', ref, label });
                    }}
                  />
                  <main className="shell__main">
                    <NotePane
                      onNoteOp={openNoteOp}
                      notes={notes}
                      onExportNote={(ref, label) => {
                        migration.openExport({ kind: 'note', ref, label });
                      }}
                    />
                  </main>
                  <div className="shell__rail">
                    <ConnectionsPanel />
                    <HealthPanel />
                  </div>
                </div>
              )}
            </div>
          </SearchPaletteProvider>
        )}
      </NoteOpsHost>
    </NewNoteDialogProvider>
  );
}
