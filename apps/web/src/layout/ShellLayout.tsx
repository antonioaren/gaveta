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

export function ShellLayout() {
  const { notes, loading, error, liveError, reload } = useVaultNotes();
  const navigate = useNavigate();
  const location = useLocation();
  const graphMode = location.pathname === '/grafo';

  return (
    <TabProvider>
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
                    />
                    <main className="shell__main">
                      <NotePane onNoteOp={openNoteOp} notes={notes} />
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
    </TabProvider>
  );
}
