import { useNavigate } from 'react-router-dom';
import { ConnectionsPlaceholder } from '../connections/ConnectionsPlaceholder.tsx';
import { NoteExplorer } from '../explorer/NoteExplorer.tsx';
import { useVaultNotes } from '../hooks/useVaultNotes.ts';
import { NotePane } from '../note/NotePane.tsx';
import { TabBar } from '../tabs/TabBar.tsx';
import { TabProvider } from '../tabs/TabContext.tsx';

export function ShellLayout() {
  const { notes, loading, error } = useVaultNotes();
  const navigate = useNavigate();

  return (
    <TabProvider>
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
        <div className="shell__columns">
          <NoteExplorer notes={notes} loading={loading} error={error} />
          <main className="shell__main">
            <NotePane />
          </main>
          <ConnectionsPlaceholder />
        </div>
      </div>
    </TabProvider>
  );
}
