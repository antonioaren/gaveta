import { useMemo, useState, type MouseEvent } from 'react';
import { ExplorerNoteContextMenu } from './ExplorerNoteContextMenu.tsx';
import type { NoteListItem } from '../api/types.ts';
import { buildFolderTree, collectTags, collectTypes, type FolderNode } from './build-tree.ts';
import { noteRenderId, viewerRefForNote } from '../notes/viewer-ref.ts';
import { useTabs } from '../tabs/useTabs.ts';
import type { NoteOpKind, NoteOpTarget } from '../note-ops/note-op-target.ts';
import { noteOpTargetFromListItem } from '../note-ops/note-op-target.ts';

const TYPE_LABELS: Record<string, string> = {
  doc: 'Documento',
  slides: 'Presentación',
  todo: 'Tareas',
};

interface NoteExplorerProps {
  readonly notes: readonly NoteListItem[];
  readonly loading: boolean;
  readonly error: string | null;
  readonly onNoteOp: (kind: NoteOpKind, target: NoteOpTarget) => void;
}

export function NoteExplorer({ notes, loading, error, onNoteOp }: NoteExplorerProps) {
  const tabState = useTabs();
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<NoteListItem['type'] | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; target: NoteOpTarget } | null>(null);

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
    <aside className="explorer" role="navigation" aria-label="Explorador de notas">
      <header className="explorer__header">
        <h2 className="explorer__title">Explorador</h2>
        <p className="explorer__hint">{notes.length} notas en el vault</p>
      </header>

      <section className="explorer__filters" aria-label="Filtros">
        <label className="field">
          <span className="field__label">Tipo</span>
          <select
            className="field__control"
            value={typeFilter ?? ''}
            onChange={(event) => {
              const value = event.target.value;
              setTypeFilter(value.length === 0 ? null : (value as NoteListItem['type']));
            }}
          >
            <option value="">Todos</option>
            {types.map((type) => (
              <option key={type ?? 'sin-tipo'} value={type ?? ''}>
                {type === null ? 'Sin tipo' : (TYPE_LABELS[type] ?? type)}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field__label">Etiqueta</span>
          <select
            className="field__control"
            value={tagFilter ?? ''}
            onChange={(event) => {
              const value = event.target.value;
              setTagFilter(value.length === 0 ? null : value);
            }}
          >
            <option value="">Todas</option>
            {tags.map((tag) => (
              <option key={tag} value={tag}>
                {tag}
              </option>
            ))}
          </select>
        </label>
      </section>

      {loading ? <p className="explorer__status">Cargando notas…</p> : null}
      {error !== null ? <p className="explorer__status explorer__status--error">{error}</p> : null}

      <ExplorerNoteContextMenu
        open={menu !== null}
        x={menu?.x ?? 0}
        y={menu?.y ?? 0}
        target={menu?.target ?? null}
        onClose={() => {
          setMenu(null);
        }}
        onSelect={onNoteOp}
      />

      <nav className="explorer__tree" aria-label="Árbol de carpetas">
        <FolderBranch
          node={tree}
          depth={0}
          activeRef={activeRef}
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
}: {
  node: FolderNode;
  depth: number;
  activeRef: string | null;
  onOpen: (note: NoteListItem) => void;
  onContextMenu: (event: MouseEvent, note: NoteListItem) => void;
}) {
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
              {TYPE_LABELS[note.type] ?? note.type}
            </span>
          ) : null}
        </button>
      ))}
      {node.children.map((child) => (
        <div key={child.path} className="explorer__folder">
          <div
            className="explorer__folder-label"
            style={{ paddingLeft: `${String(12 + depth * 14)}px` }}
          >
            {child.name}
          </div>
          <FolderBranch
            node={child}
            depth={depth + 1}
            activeRef={activeRef}
            onOpen={onOpen}
            onContextMenu={onContextMenu}
          />
        </div>
      ))}
    </>
  );
}
