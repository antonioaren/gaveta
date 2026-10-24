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

interface ImportPreviewDialogProps {
  readonly files: readonly UploadFileEntry[];
  readonly onClose: () => void;
  readonly onCommitted: () => void;
}

export function ImportPreviewDialog({ files, onClose, onCommitted }: ImportPreviewDialogProps) {
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
          setError(
            caught instanceof Error ? caught.message : 'No se pudo preparar la vista previa',
          );
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
          setError(
            caught instanceof Error ? caught.message : 'No se pudo preparar la vista previa',
          );
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
      setError(caught instanceof Error ? caught.message : 'No se pudo importar');
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
            Importar Markdown
          </h2>
          <button type="button" className="modal__close" onClick={onClose} aria-label="Cerrar">
            ×
          </button>
        </header>
        <div className="modal__body migration-modal__body">
          {loading ? <p>Cargando vista previa…</p> : null}
          {error !== null ? <p className="migration-modal__error">{error}</p> : null}
          {preview !== null ? (
            <>
              <p className="migration-modal__summary" data-testid="import-preview-summary">
                Vista previa de importación: {formatImportSummary(preview.summary)}.
              </p>
              <label className="field">
                <span className="field__label">Carpeta destino en el vault (opcional)</span>
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
                <span className="field__label">Si existe conflicto</span>
                <select
                  className="field__control"
                  value={onConflict}
                  onChange={(event) => {
                    setOnConflict(event.target.value as 'skip' | 'rename' | 'overwrite');
                  }}
                >
                  <option value="skip">Omitir</option>
                  <option value="rename">Renombrar</option>
                  <option value="overwrite">Sobrescribir</option>
                </select>
              </label>
              <div className="migration-modal__table-wrap">
                <table className="migration-table">
                  <thead>
                    <tr>
                      <th>Origen</th>
                      <th>Destino</th>
                      <th>Acción</th>
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
                  {preview.failures.length} archivo(s) con error antes de importar.
                </p>
              ) : null}
            </>
          ) : null}
        </div>
        <footer className="modal__footer">
          <button type="button" className="button button--ghost" onClick={onClose}>
            Cancelar
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
            {submitting ? 'Importando…' : 'Confirmar importación'}
          </button>
        </footer>
      </div>
    </div>
  );
}
