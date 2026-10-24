import { useEffect, useRef } from 'react';
import type { FolderOpKind } from '../folder-ops/folder-op-kind.ts';

interface ExplorerFolderContextMenuProps {
  readonly open: boolean;
  readonly x: number;
  readonly y: number;
  readonly folder: string;
  readonly onClose: () => void;
  readonly onSelect: (kind: FolderOpKind, folder: string) => void;
  readonly onExport: (folder: string, label: string) => void;
}

export function ExplorerFolderContextMenu({
  open,
  x,
  y,
  folder,
  onClose,
  onSelect,
  onExport,
}: ExplorerFolderContextMenuProps) {
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

  if (!open) {
    return null;
  }

  return (
    <div
      ref={menuRef}
      className="explorer-context-menu"
      style={{ top: y, left: x }}
      role="menu"
      aria-label="Acciones de la carpeta"
      data-testid="explorer-folder-context-menu"
    >
      <button
        type="button"
        role="menuitem"
        className="explorer-context-menu__item"
        data-testid="explorer-folder-export"
        onClick={() => {
          const label = folder.length === 0 ? 'vault' : folder.split('/').pop() ?? folder;
          onExport(folder, label);
          onClose();
        }}
      >
        Exportar a Markdown
      </button>
      <button
        type="button"
        role="menuitem"
        className="explorer-context-menu__item"
        data-testid="explorer-folder-create"
        onClick={() => {
          onSelect('create', folder);
          onClose();
        }}
      >
        Nueva subcarpeta
      </button>
      <button
        type="button"
        role="menuitem"
        className="explorer-context-menu__item"
        data-testid="explorer-folder-rename"
        onClick={() => {
          onSelect('rename', folder);
          onClose();
        }}
      >
        Renombrar
      </button>
      <button
        type="button"
        role="menuitem"
        className="explorer-context-menu__item explorer-context-menu__item--danger"
        data-testid="explorer-folder-delete"
        onClick={() => {
          onSelect('delete', folder);
          onClose();
        }}
      >
        Borrar
      </button>
    </div>
  );
}
