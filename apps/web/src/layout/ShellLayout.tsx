import { useLocation, useNavigate } from 'react-router-dom';
import { GlobalGraphView } from '../graph/GlobalGraphView.tsx';
import { AggregatedTasksView } from '../tasks/AggregatedTasksView.tsx';
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
import { useI18n } from '../i18n/useI18n.ts';
import { ThemeToggle } from '../theme/ThemeToggle.tsx';
import type { Locale } from '@gaveta/i18n';

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
  const tasksMode = location.pathname === '/tareas';
  const { t, locale, setLocale } = useI18n();

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
                  <span className="topbar__name">{t('web.shell.brand')}</span>
                </div>
                <div className="topbar__nav">
                  <label className="topbar__locale">
                    <span className="visually-hidden">{t('web.language.select.aria')}</span>
                    <select
                      className="topbar__button topbar__button--select"
                      data-testid="language-select"
                      aria-label={t('web.language.select.aria')}
                      value={locale}
                      onChange={(event) => {
                        setLocale(event.target.value as Locale);
                      }}
                    >
                      <option value="en">{t('web.language.en')}</option>
                      <option value="es">{t('web.language.es')}</option>
                    </select>
                  </label>
                  <ThemeToggle />
                  <button
                    type="button"
                    className="topbar__button"
                    data-testid="vault-import"
                    onClick={migration.openImportPicker}
                  >
                    {t('web.common.import')}
                  </button>
                  <button
                    type="button"
                    className="topbar__button"
                    data-testid="vault-export"
                    onClick={() => {
                      migration.openExport({ kind: 'vault' });
                    }}
                  >
                    {t('web.common.exportMarkdown')}
                  </button>
                  <button
                    type="button"
                    className="topbar__button"
                    onClick={() => {
                      if (graphMode || tasksMode) {
                        void navigate('/');
                        return;
                      }
                      void navigate('/grafo');
                    }}
                  >
                    {graphMode || tasksMode ? t('web.topbar.notes') : t('web.topbar.graph')}
                  </button>
                  <button
                    type="button"
                    className="topbar__button"
                    data-testid="topbar-tasks"
                    onClick={() => {
                      void navigate(tasksMode ? '/' : '/tareas');
                    }}
                  >
                    {tasksMode ? t('web.topbar.notes') : t('web.topbar.tasks')}
                  </button>
                  <button
                    type="button"
                    className="topbar__button"
                    onClick={() => {
                      void navigate(-1);
                    }}
                  >
                    {t('web.topbar.back')}
                  </button>
                  <button
                    type="button"
                    className="topbar__button"
                    onClick={() => {
                      void navigate(1);
                    }}
                  >
                    {t('web.topbar.forward')}
                  </button>
                </div>
              </header>
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
          </>
        )}
      </NoteOpsHost>
    </NewNoteDialogProvider>
  );
}
