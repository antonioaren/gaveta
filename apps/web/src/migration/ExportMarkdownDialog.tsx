import { useEffect, useId, useState } from 'react';
import type { ExportPreviewData } from '../api/migration-types.ts';
import { downloadExportZip, previewExport, type ExportScope } from '../api/migration.ts';
import { formatExportSummary } from './migration-summary.ts';

export type ExportMarkdownTarget =
  | { readonly kind: 'note'; readonly ref: string; readonly label: string }
  | { readonly kind: 'folder'; readonly ref: string; readonly label: string }
  | { readonly kind: 'vault' };

interface ExportMarkdownDialogProps {
  readonly target: ExportMarkdownTarget;
  readonly onClose: () => void;
}

function scopeFromTarget(target: ExportMarkdownTarget): ExportScope {
  if (target.kind === 'vault') {
    return { all: true, links: 'wiki' };
  }
  return { ref: target.ref, links: 'wiki' };
}

export function ExportMarkdownDialog({ target, onClose }: ExportMarkdownDialogProps) {
  const titleId = useId();
  const [preview, setPreview] = useState<ExportPreviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const run = async (): Promise<void> => {
      setLoading(true);
      setError(null);
      try {
        const data = await previewExport(scopeFromTarget(target));
        if (!cancelled) {
          setPreview(data);
        }
      } catch (caught) {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : 'No se pudo preparar la exportación');
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
  }, [target]);

  const download = async (): Promise<void> => {
    setSubmitting(true);
    setError(null);
    try {
      const label =
        target.kind === 'vault' ? 'gaveta-vault' : target.label.replace(/[^a-zA-Z0-9._-]+/g, '-');
      await downloadExportZip(scopeFromTarget(target), label);
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se pudo exportar');
      setSubmitting(false);
    }
  };

  const title =
    target.kind === 'vault'
      ? 'Exportar vault a Markdown'
      : target.kind === 'folder'
        ? `Exportar carpeta «${target.label}»`
        : `Exportar nota «${target.label}»`;

  return (
    <div className="modal-backdrop" role="presentation" data-testid="export-preview-dialog">
      <div
        className="modal migration-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <header className="modal__header">
          <h2 id={titleId} className="modal__title">
            {title}
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
              <p className="migration-modal__summary" data-testid="export-preview-summary">
                {preview.blocked
                  ? `Vista previa bloqueada: ${formatExportSummary(preview.summary)}.`
                  : `Vista previa de exportación: ${formatExportSummary(preview.summary)}.`}
              </p>
              <div className="migration-modal__table-wrap">
                <table className="migration-table">
                  <thead>
                    <tr>
                      <th>Markdown</th>
                      <th>Nota</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.notes.map((note) => (
                      <tr key={note.path}>
                        <td>{note.path}</td>
                        <td>{note.source}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
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
            disabled={loading || submitting || preview === null || preview.blocked}
            data-testid="export-preview-confirm"
            onClick={() => {
              void download();
            }}
          >
            {submitting ? 'Exportando…' : 'Descargar ZIP'}
          </button>
        </footer>
      </div>
    </div>
  );
}
