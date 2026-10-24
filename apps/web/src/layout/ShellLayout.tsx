import { useLocation, useNavigate } from 'react-router-dom';
import { GlobalGraphView } from '../graph/GlobalGraphView.tsx';
import { ConnectionsPanel } from '../connections/ConnectionsPanel.tsx';
import { HealthPanel } from '../health/HealthPanel.tsx';
import { NoteExplorer } from '../explorer/NoteExplorer.tsx';
import { useVaultNotes } from '../hooks/useVaultNotes.ts';
import { NotePane } from '../note/NotePane.tsx';
import { TabBar } from '../tabs/TabBar.tsx';
import { SearchPaletteHost } from '../search/SearchPalette.tsx';
import { NewNoteDialog } from '../new-note/NewNoteDialog.tsx';
import { NewNoteDialogProvider } from '../new-note/NewNoteDialogProvider.tsx';
import { NewNoteShortcuts } from '../new-note/NewNoteShortcuts.tsx';
import { TabProvider } from '../tabs/TabContext.tsx';
import { NoteOpsHost } from '../note-ops/NoteOpsHost.tsx';
import { MigrationHost } from '../migration/MigrationHost.tsx';
import { useMigrationActions } from '../migration/MigrationActionsContext.tsx';
import type { NoteListItem } from '../api/types.ts';

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
  const navigate = useNavigate();
  const location = useLocation();
  const graphMode = location.pathname === '/grafo';

  return (
    <NewNoteDialogProvider>
      <NewNoteShortcuts />
      <NewNoteDialog notes={notes} />
      <NoteOpsHost notes={notes} onRefreshNotes={reload}>
        {(openNoteOp) => (
          <>
            <SearchPaletteHost />
            <div className="shell">
              <header className="topbar">
                <div className="topbar__brand">
                  <span className="topbar__logo" aria-hidden="true">
                    ◈
                  </span>
                  <span className="topbar__name">Gaveta</span>
                </div>
                <div className="topbar__nav">
                  <button
                    type="button"
                    className="topbar__button"
                    data-testid="vault-import"
                    onClick={migration.openImportPicker}
                  >
                    Importar
                  </button>
                  <button
                    type="button"
                    className="topbar__button"
                    data-testid="vault-export"
                    onClick={() => {
                      migration.openExport({ kind: 'vault' });
                    }}
                  >
                    Exportar a Markdown
                  </button>
                  <button
                    type="button"
                    className="topbar__button"
                    onClick={() => {
                      void navigate(graphMode ? '/' : '/grafo');
                    }}
                  >
                    {graphMode ? 'Notas' : 'Grafo'}
                  </button>
                  <button
                    type="button"
                    className="topbar__button"
                    onClick={() => {
                      void navigate(-1);
                    }}
                  >
                    Atrás
                  </button>
                  <button
                    type="button"
                    className="topbar__button"
                    onClick={() => {
                      void navigate(1);
                    }}
                  >
                    Adelante
                  </button>
                </div>
              </header>
              <TabBar />
              {graphMode ? (
                <main className="shell__main shell__main--graph">
                  <GlobalGraphView />
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
          </>
        )}
      </NoteOpsHost>
    </NewNoteDialogProvider>
  );
}
