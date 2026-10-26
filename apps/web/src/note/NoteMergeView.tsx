import { useMemo } from 'react';
import { useI18n } from '../i18n/useI18n.ts';
import { diffLines } from './diff-lines.ts';

export interface NoteMergeViewProps {
  readonly yoursHtml: string;
  readonly theirsHtml: string;
  readonly saving?: boolean;
  readonly onAcceptTheirs: () => void;
  readonly onKeepMine: () => void;
  readonly onClose: () => void;
}

export function NoteMergeView({
  yoursHtml,
  theirsHtml,
  saving = false,
  onAcceptTheirs,
  onKeepMine,
  onClose,
}: NoteMergeViewProps) {
  const { t } = useI18n();
  const rows = useMemo(() => diffLines(yoursHtml, theirsHtml), [yoursHtml, theirsHtml]);

  return (
    <div
      className="merge-view"
      role="dialog"
      aria-modal="true"
      aria-labelledby="merge-view-title"
      data-testid="note-merge-view"
    >
      <header className="merge-view__header">
        <h2 id="merge-view-title" className="merge-view__title">
          {t('web.note.merge.title')}
        </h2>
        <p className="merge-view__legend">
          <span className="merge-view__legend-item merge-view__legend-item--yours">
            {t('web.note.merge.yours')}
          </span>
          <span className="merge-view__legend-item merge-view__legend-item--theirs">
            {t('web.note.merge.theirs')}
          </span>
        </p>
      </header>
      <pre className="merge-view__diff" data-testid="note-merge-diff">
        {rows.map((row, index) => (
          <div
            key={`${row.kind}-${String(index)}`}
            className={`merge-view__line merge-view__line--${row.kind}`}
          >
            <span className="merge-view__prefix" aria-hidden="true">
              {row.kind === 'add' ? '+' : row.kind === 'remove' ? '-' : ' '}
            </span>
            <span className="merge-view__text">{row.text}</span>
          </div>
        ))}
      </pre>
      <footer className="merge-view__actions">
        <button
          type="button"
          className="merge-view__button"
          data-testid="note-merge-accept-theirs"
          disabled={saving}
          onClick={onAcceptTheirs}
        >
          {t('web.note.merge.acceptTheirs')}
        </button>
        <button
          type="button"
          className="merge-view__button merge-view__button--primary"
          data-testid="note-merge-keep-mine"
          disabled={saving}
          onClick={onKeepMine}
        >
          {t('web.note.merge.keepMine')}
        </button>
        <button
          type="button"
          className="merge-view__button"
          data-testid="note-merge-close"
          disabled={saving}
          onClick={onClose}
        >
          {t('web.note.merge.close')}
        </button>
      </footer>
    </div>
  );
}
