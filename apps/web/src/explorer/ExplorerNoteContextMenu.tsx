import { useEffect, useRef } from 'react';
import type { NoteOpKind, NoteOpTarget } from '../note-ops/note-op-target.ts';
import { useI18n } from '../i18n/useI18n.ts';

interface ExplorerNoteContextMenuProps {
  readonly open: boolean;
  readonly x: number;
  readonly y: number;
  readonly target: NoteOpTarget | null;
  readonly onClose: () => void;
  readonly onSelect: (kind: NoteOpKind, target: NoteOpTarget) => void;
  readonly onExport: (target: NoteOpTarget) => void;
}

export function ExplorerNoteContextMenu({
  open,
  x,
  y,
  target,
  onClose,
  onSelect,
  onExport,
}: ExplorerNoteContextMenuProps) {
  const { t } = useI18n();
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onPointerDown = (event: PointerEvent) => {
      const menu = menuRef.current;
      if (menu !== null && event.target instanceof Node && menu.contains(event.target)) {
        return;
      }
      onClose();
    };
    window.addEventListener('pointerdown', onPointerDown);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
    };
  }, [onClose, open]);

  if (!open || target === null) {
    return null;
  }

  return (
    <div
      ref={menuRef}
      className="explorer-context-menu"
      style={{ top: y, left: x }}
      role="menu"
      aria-label={t('web.noteOps.aria')}
      data-testid="explorer-context-menu"
    >
      <button
        type="button"
        role="menuitem"
        className="explorer-context-menu__item"
        data-testid="explorer-context-export"
        onClick={() => {
          onExport(target);
          onClose();
        }}
      >
        {t('web.common.exportMarkdown')}
      </button>
      {(['rename', 'move', 'delete'] as const).map((kind) => (
        <button
          key={kind}
          type="button"
          role="menuitem"
          className={`explorer-context-menu__item${kind === 'delete' ? ' explorer-context-menu__item--danger' : ''}`}
          data-testid={`explorer-context-${kind}`}
          onClick={() => {
            onSelect(kind, target);
            onClose();
          }}
        >
          {kind === 'rename'
            ? t('web.common.rename')
            : kind === 'move'
              ? t('web.common.move')
              : t('web.common.delete')}
        </button>
      ))}
    </div>
  );
}
