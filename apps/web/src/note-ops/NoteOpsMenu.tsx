import { useI18n } from '../i18n/useI18n.ts';
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
  const { t } = useI18n();
  return (
    <div className={`note-ops-menu ${className}`} role="group" aria-label={t('web.noteOps.aria')}>
      <button
        type="button"
        className="note-ops-menu__button"
        data-testid="note-action-export"
        onClick={onExport}
      >
        {t('web.common.exportMarkdown')}
      </button>
      <button
        type="button"
        className="note-ops-menu__button"
        data-testid="note-action-rename"
        onClick={() => {
          onOpen('rename', target);
        }}
      >
        {t('web.common.rename')}
      </button>
      <button
        type="button"
        className="note-ops-menu__button"
        data-testid="note-action-move"
        onClick={() => {
          onOpen('move', target);
        }}
      >
        {t('web.common.move')}
      </button>
      <button
        type="button"
        className="note-ops-menu__button note-ops-menu__button--danger"
        data-testid="note-action-delete"
        onClick={() => {
          onOpen('delete', target);
        }}
      >
        {t('web.common.delete')}
      </button>
    </div>
  );
}
