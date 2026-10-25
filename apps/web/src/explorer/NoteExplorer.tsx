import { useMemo, useState, type MouseEvent } from 'react';
import { FolderOpsDialog } from '../folder-ops/FolderOpsDialog.tsx';
import type { FolderOpKind } from '../folder-ops/folder-op-kind.ts';
import { ExplorerNoteContextMenu } from './ExplorerNoteContextMenu.tsx';
import { ExplorerFolderContextMenu } from './ExplorerFolderContextMenu.tsx';
import type { NoteListItem } from '../api/types.ts';
import { buildFolderTree, collectTags, collectTypes, type FolderNode } from './build-tree.ts';
import { noteRenderId, viewerRefForNote } from '../notes/viewer-ref.ts';
import { useNewNoteDialog } from '../new-note/useNewNoteDialog.ts';
import { useTabs } from '../tabs/useTabs.ts';
import type { NoteOpKind, NoteOpTarget } from '../note-ops/note-op-target.ts';
import { noteOpTargetFromListItem } from '../note-ops/note-op-target.ts';
import { useI18n } from '../i18n/useI18n.ts';
import { noteTypeMessageKeyForFilter } from '../i18n/note-type-label.ts';

interface NoteExplorerProps {
  readonly notes: readonly NoteListItem[];
  readonly loading: boolean;
  readonly error: string | null;
  readonly onNoteOp: (kind: NoteOpKind, target: NoteOpTarget) => void;
  readonly onExportFolder: (folderPath: string, label: string) => void;
  readonly onExportNote: (ref: string, label: string) => void;
}

export function NoteExplorer({
  notes,
  loading,
  error,
  onNoteOp,
  onExportFolder,
  onExportNote,
}: NoteExplorerProps) {
  const { t } = useI18n();
  const tabState = useTabs();
  const { openNewNote } = useNewNoteDialog();
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<NoteListItem['type'] | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; target: NoteOpTarget } | null>(null);
  const [folderMenu, setFolderMenu] = useState<{ x: number; y: number; folder: string } | null>(
    null,
  );
  const [folderOp, setFolderOp] = useState<{ kind: FolderOpKind; folder: string } | null>(null);

  const filtered = useMemo(() => {
    return notes.filter((note) => {
      if (typeFilter !== null && note.type !== typeFilter) {
        return false;
      }
      if (tagFilter !== null && !note.tags.includes(tagFilter)) {
        return false;
      }
      return true;
    });
  }, [notes, tagFilter, typeFilter]);

  const tree = useMemo(() => buildFolderTree(filtered), [filtered]);
  const tags = useMemo(() => collectTags(notes), [notes]);
  const types = useMemo(() => collectTypes(notes), [notes]);
  const activeRef = tabState.tabs.find((tab) => tab.id === tabState.activeTabId)?.ref ?? null;

  return (
    <aside className="explorer" role="navigation" aria-label={t('web.explorer.aria')}>
      <header className="explorer__header">
        <div className="explorer__header-row">
          <h2 className="explorer__title">{t('web.explorer.title')}</h2>
          <div className="explorer__header-actions">
            <button
              type="button"
              className="explorer__new-note"
              onClick={() => {
                setFolderOp({ kind: 'create', folder: '' });
              }}
              data-testid="explorer-new-folder"
            >
              {t('web.explorer.newFolder')}
            </button>
            <button
              type="button"
              className="explorer__new-note"
              onClick={() => {
                openNewNote();
              }}
            >
              {t('web.explorer.newNote')}
            </button>
          </div>
        </div>
        <p className="explorer__hint">{t('web.explorer.noteCount', { count: notes.length })}</p>
      </header>

      <section className="explorer__filters" aria-label={t('web.explorer.filters.aria')}>
        <label className="field">
          <span className="field__label">{t('web.common.type')}</span>
          <select
            className="field__control"
            value={typeFilter ?? ''}
            onChange={(event) => {
              const value = event.target.value;
              setTypeFilter(value.length === 0 ? null : (value as NoteListItem['type']));
            }}
          >
            <option value="">{t('web.common.allMasculine')}</option>
            {types.map((type) => {
              const typeKey = type === null ? null : noteTypeMessageKeyForFilter(type);
              return (
                <option key={type ?? 'sin-tipo'} value={type ?? ''}>
                  {type === null
                    ? t('web.explorer.type.noType')
                    : typeKey !== null
                      ? t(typeKey)
                      : type}
                </option>
              );
            })}
          </select>
        </label>
        <label className="field">
          <span className="field__label">{t('web.common.tag')}</span>
          <select
            className="field__control"
            value={tagFilter ?? ''}
            onChange={(event) => {
              const value = event.target.value;
              setTagFilter(value.length === 0 ? null : value);
            }}
          >
            <option value="">{t('web.common.allFeminine')}</option>
            {tags.map((tag) => (
              <option key={tag} value={tag}>
                {tag}
              </option>
            ))}
          </select>
        </label>
      </section>

      {loading ? <p className="explorer__status">{t('web.explorer.loading')}</p> : null}
      {error !== null ? <p className="explorer__status explorer__status--error">{error}</p> : null}

      {folderOp !== null ? (
        <FolderOpsDialog
          kind={folderOp.kind}
          folder={folderOp.folder}
          onClose={() => {
            setFolderOp(null);
          }}
        />
      ) : null}

      <ExplorerFolderContextMenu
        open={folderMenu !== null}
        x={folderMenu?.x ?? 0}
        y={folderMenu?.y ?? 0}
        folder={folderMenu?.folder ?? ''}
        onClose={() => {
          setFolderMenu(null);
        }}
        onSelect={(kind, folder) => {
          setFolderOp({ kind, folder });
        }}
        onExport={(folder, label) => {
          onExportFolder(folder, label);
        }}
      />

      <ExplorerNoteContextMenu
        open={menu !== null}
        x={menu?.x ?? 0}
        y={menu?.y ?? 0}
        target={menu?.target ?? null}
        onClose={() => {
          setMenu(null);
        }}
        onSelect={onNoteOp}
        onExport={(target) => {
          onExportNote(target.ref, target.title);
        }}
      />

      <nav className="explorer__tree" aria-label={t('web.explorer.tree.aria')}>
        <FolderBranch
          node={tree}
          depth={0}
          activeRef={activeRef}
          onFolderContextMenu={(event, folderPath) => {
            event.preventDefault();
            setFolderMenu({ x: event.clientX, y: event.clientY, folder: folderPath });
          }}
          onContextMenu={(event, note) => {
            setMenu({ x: event.clientX, y: event.clientY, target: noteOpTargetFromListItem(note) });
          }}
          onOpen={(note) => {
            tabState.openTab(viewerRefForNote(note), note.title, note.path, noteRenderId(note));
          }}
        />
      </nav>
    </aside>
  );
}

function FolderBranch({
  node,
  depth,
  activeRef,
  onOpen,
  onContextMenu,
  onFolderContextMenu,
}: {
  node: FolderNode;
  depth: number;
  activeRef: string | null;
  onOpen: (note: NoteListItem) => void;
  onContextMenu: (event: MouseEvent, note: NoteListItem) => void;
  onFolderContextMenu: (event: MouseEvent, folderPath: string) => void;
}) {
  const { t } = useI18n();
  return (
    <>
      {node.notes.map((note) => (
        <button
          key={note.path}
          type="button"
          className={`explorer__note explorer__note--${note.type ?? 'unknown'}${activeRef === note.path ? ' explorer__note--active' : ''}`}
          style={{ paddingLeft: `${String(12 + depth * 14)}px` }}
          onClick={() => {
            onOpen(note);
          }}
          onContextMenu={(event) => {
            event.preventDefault();
            onContextMenu(event, note);
          }}
          data-testid={`explorer-note-${note.path}`}
        >
          <span className="explorer__note-title">{note.title}</span>
          {note.type !== null ? (
            <span className={`badge badge--${note.type}`}>
              {(() => {
                const typeKey = noteTypeMessageKeyForFilter(note.type);
                return typeKey !== null ? t(typeKey) : note.type;
              })()}
            </span>
          ) : null}
        </button>
      ))}
      {node.children.map((child) => (
        <div key={child.path} className="explorer__folder">
          <div
            className="explorer__folder-label"
            style={{ paddingLeft: `${String(12 + depth * 14)}px` }}
            onContextMenu={(event) => {
              onFolderContextMenu(event, child.path);
            }}
            data-testid={`explorer-folder-${child.path}`}
          >
            {child.name}
          </div>
          <FolderBranch
            node={child}
            depth={depth + 1}
            activeRef={activeRef}
            onOpen={onOpen}
            onContextMenu={onContextMenu}
            onFolderContextMenu={onFolderContextMenu}
          />
        </div>
      ))}
    </>
  );
}
