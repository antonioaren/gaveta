import type { NoteOpKind, NoteOpTarget } from './note-op-target.ts';

export function NoteOpsMenuButtons({
  target,
  onOpen,
  onExport,
  className = '',
}: {
  readonly target: NoteOpTarget;
  readonly onOpen: (kind: NoteOpKind, target: NoteOpTarget) => void;
  readonly onExport: () => void;
  readonly className?: string;
}) {
  return (
    <div className={`note-ops-menu ${className}`} role="group" aria-label="Acciones de la nota">
      <button
        type="button"
        className="note-ops-menu__button"
        data-testid="note-action-export"
        onClick={onExport}
      >
        Exportar a Markdown
      </button>
      <button
        type="button"
        className="note-ops-menu__button"
        data-testid="note-action-rename"
        onClick={() => {
          onOpen('rename', target);
        }}
      >
        Renombrar
      </button>
      <button
        type="button"
        className="note-ops-menu__button"
        data-testid="note-action-move"
        onClick={() => {
          onOpen('move', target);
        }}
      >
        Mover
      </button>
      <button
        type="button"
        className="note-ops-menu__button note-ops-menu__button--danger"
        data-testid="note-action-delete"
        onClick={() => {
          onOpen('delete', target);
        }}
      >
        Borrar
      </button>
    </div>
  );
}
