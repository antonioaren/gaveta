import {
  MoreHorizontal,
  Pencil,
  Code2,
  Download,
  PencilLine,
  FolderInput,
  Trash2,
} from 'lucide-react';
import { useI18n } from '../i18n/useI18n.ts';
import type { NoteOpKind, NoteOpTarget } from './note-op-target.ts';
import { Button } from '../ui/Button.tsx';
import { DropdownMenu, DropdownMenuItem } from '../ui/DropdownMenu.tsx';
import { IconButton } from '../ui/IconButton.tsx';

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
  const { t } = useI18n();
  return (
    <div
      className={`note-toolbar__ops ${className}`}
      role="group"
      aria-label={t('web.noteOps.aria')}
    >
      <DropdownMenu
        testId="note-actions-menu"
        trigger={({ open, toggle, menuId }) => (
          <IconButton
            icon={MoreHorizontal}
            label={t('web.noteOps.more.aria')}
            data-testid="note-actions-menu-trigger"
            aria-expanded={open}
            aria-controls={menuId}
            onClick={toggle}
          />
        )}
      >
        <DropdownMenuItem
          testId="note-action-export"
          onSelect={() => {
            onExport();
          }}
        >
          <Download aria-hidden size={16} strokeWidth={2} />
          {t('web.common.exportMarkdown')}
        </DropdownMenuItem>
        <DropdownMenuItem
          testId="note-action-rename"
          onSelect={() => {
            onOpen('rename', target);
          }}
        >
          <PencilLine aria-hidden size={16} strokeWidth={2} />
          {t('web.common.rename')}
        </DropdownMenuItem>
        <DropdownMenuItem
          testId="note-action-move"
          onSelect={() => {
            onOpen('move', target);
          }}
        >
          <FolderInput aria-hidden size={16} strokeWidth={2} />
          {t('web.common.move')}
        </DropdownMenuItem>
        <DropdownMenuItem
          testId="note-action-delete"
          destructive
          onSelect={() => {
            onOpen('delete', target);
          }}
        >
          <Trash2 aria-hidden size={16} strokeWidth={2} />
          {t('web.common.delete')}
        </DropdownMenuItem>
      </DropdownMenu>
    </div>
  );
}

export function NoteToolbarPrimary({
  loadingEdit,
  onEdit,
  onCodeMode,
}: {
  readonly loadingEdit: boolean;
  readonly onEdit: () => void;
  readonly onCodeMode: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className="note-toolbar__primary">
      <Button
        variant="primary"
        data-testid="note-edit-button"
        disabled={loadingEdit}
        onClick={onEdit}
      >
        <Pencil aria-hidden size={16} strokeWidth={2} />
        {loadingEdit ? t('web.common.opening') : t('web.note.edit')}
      </Button>
      <Button variant="ghost" data-testid="enter-code-mode" onClick={onCodeMode}>
        <Code2 aria-hidden size={16} strokeWidth={2} />
        {t('web.note.mode.code')}
      </Button>
    </div>
  );
}
