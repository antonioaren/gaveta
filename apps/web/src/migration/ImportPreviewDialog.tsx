import { useEffect, useId, useState } from 'react';
import type { ImportPreviewData } from '../api/migration-types.ts';
import {
  commitImport,
  createImportStaging,
  previewImport,
  uploadImportStagingFile,
} from '../api/migration.ts';
import type { UploadFileEntry } from './collect-upload-files.ts';
import { formatImportSummary } from './migration-summary.ts';
import { useI18n } from '../i18n/useI18n.ts';
import { messageFromCaught } from '../i18n/api-error-message.ts';

interface ImportPreviewDialogProps {
  readonly files: readonly UploadFileEntry[];
  readonly onClose: () => void;
  readonly onCommitted: () => void;
}

export function ImportPreviewDialog({ files, onClose, onCommitted }: ImportPreviewDialogProps) {
  const { t } = useI18n();
  const titleId = useId();
  const [preview, setPreview] = useState<ImportPreviewData | null>(null);
  const [stagingId, setStagingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inFolder, setInFolder] = useState('');
  const [onConflict, setOnConflict] = useState<'skip' | 'rename' | 'overwrite'>('skip');

  useEffect(() => {
    let cancelled = false;
    const upload = async (): Promise<void> => {
      setLoading(true);
      setError(null);
      try {
        const id = await createImportStaging();
        for (const file of files) {
          await uploadImportStagingFile(id, file.relativePath, file.bytes);
        }
        if (!cancelled) {
          setStagingId(id);
        }
      } catch (caught) {
        if (!cancelled) {
          setError(messageFromCaught(caught, 'web.api.error.fallbackImportPrepare'));
          setLoading(false);
        }
      }
    };
    void upload();
    return () => {
      cancelled = true;
    };
  }, [files]);

  useEffect(() => {
    if (stagingId === null) {
      return;
    }
    let cancelled = false;
    const run = async (): Promise<void> => {
      setLoading(true);
      setError(null);
      try {
        const data = await previewImport(stagingId, {
          ...(inFolder.trim().length > 0 ? { in: inFolder.trim() } : {}),
          onConflict,
        });
        if (!cancelled) {
          setPreview(data);
        }
      } catch (caught) {
        if (!cancelled) {
          setError(messageFromCaught(caught, 'web.api.error.fallbackImportPrepare'));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [inFolder, onConflict, stagingId]);

  const confirm = async (): Promise<void> => {
    if (stagingId === null) {
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await commitImport(stagingId, {
        ...(inFolder.trim().length > 0 ? { in: inFolder.trim() } : {}),
        onConflict,
      });
      onCommitted();
      onClose();
    } catch (caught) {
      setError(messageFromCaught(caught, 'web.api.error.fallbackImport'));
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop" role="presentation" data-testid="import-preview-dialog">
      <div
        className="modal migration-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <header className="modal__header">
          <h2 id={titleId} className="modal__title">
            {t('web.migration.import.title')}
          </h2>
          <button
            type="button"
            className="modal__close"
            onClick={onClose}
            aria-label={t('web.common.close')}
          >
            ×
          </button>
        </header>
        <div className="modal__body migration-modal__body">
          {loading ? <p>{t('web.migration.loadingPreview')}</p> : null}
          {error !== null ? <p className="migration-modal__error">{error}</p> : null}
          {preview !== null ? (
            <>
              <p className="migration-modal__summary" data-testid="import-preview-summary">
                {t('web.migration.import.previewSummary', {
                  summary: formatImportSummary(preview.summary, t),
                })}
              </p>
              <label className="field">
                <span className="field__label">{t('web.migration.import.field.destFolder')}</span>
                <input
                  className="field__control"
                  value={inFolder}
                  onChange={(event) => {
                    setInFolder(event.target.value);
                  }}
                  data-testid="import-in-folder"
                />
              </label>
              <label className="field">
                <span className="field__label">{t('web.migration.import.field.conflict')}</span>
                <select
                  className="field__control"
                  value={onConflict}
                  onChange={(event) => {
                    setOnConflict(event.target.value as 'skip' | 'rename' | 'overwrite');
                  }}
                >
                  <option value="skip">{t('web.migration.import.conflict.skip')}</option>
                  <option value="rename">{t('web.migration.import.conflict.rename')}</option>
                  <option value="overwrite">{t('web.migration.import.conflict.overwrite')}</option>
                </select>
              </label>
              <div className="migration-modal__table-wrap">
                <table className="migration-table">
                  <thead>
                    <tr>
                      <th>{t('web.migration.import.table.source')}</th>
                      <th>{t('web.migration.import.table.dest')}</th>
                      <th>{t('web.migration.import.table.action')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.notes.map((note) => (
                      <tr key={`${note.sourceMd}-${note.path}`}>
                        <td>{note.sourceMd}</td>
                        <td>{note.path}</td>
                        <td>{note.action}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {preview.failures.length > 0 ? (
                <p className="migration-modal__error">
                  {t('web.migration.import.failures', { count: preview.failures.length })}
                </p>
              ) : null}
            </>
          ) : null}
        </div>
        <footer className="modal__footer">
          <button type="button" className="button button--ghost" onClick={onClose}>
            {t('web.common.cancel')}
          </button>
          <button
            type="button"
            className="button button--primary"
            disabled={loading || submitting || preview === null || preview.failures.length > 0}
            data-testid="import-preview-confirm"
            onClick={() => {
              void confirm();
            }}
          >
            {submitting ? t('web.migration.import.importing') : t('web.migration.import.confirm')}
          </button>
        </footer>
      </div>
    </div>
  );
}
