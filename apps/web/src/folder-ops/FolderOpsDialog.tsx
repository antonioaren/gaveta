import { useId, useState } from 'react';
import { ApiError } from '../api/client.ts';
import { postMkdirFolder, postMoveFolder, postRemoveFolder } from '../api/folder-write.ts';
import type { FolderOpKind } from './folder-op-kind.ts';

interface FolderOpsDialogProps {
  readonly kind: FolderOpKind;
  readonly folder: string;
  readonly onClose: () => void;
}

export function FolderOpsDialog({ kind, folder, onClose }: FolderOpsDialogProps) {
  const titleId = useId();
  const [nameInput, setNameInput] = useState(
    kind === 'rename' ? (folder.split('/').pop() ?? '') : '',
  );
  const [parentInput, setParentInput] = useState(
    kind === 'rename' ? folder.split('/').slice(0, -1).join('/') : folder,
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dangerStep, setDangerStep] = useState(false);

  const title =
    kind === 'create'
      ? 'Nueva carpeta'
      : kind === 'rename'
        ? 'Renombrar carpeta'
        : 'Borrar carpeta';

  async function submit(): Promise<void> {
    setSubmitting(true);
    setError(null);
    try {
      if (kind === 'create') {
        const path =
          parentInput.trim().length === 0
            ? nameInput.trim()
            : `${parentInput.trim()}/${nameInput.trim()}`;
        await postMkdirFolder(path);
      } else if (kind === 'rename') {
        const parent = parentInput.trim();
        const next = parent.length === 0 ? nameInput.trim() : `${parent}/${nameInput.trim()}`;
        await postMoveFolder(folder, next);
      } else {
        await postRemoveFolder(folder, dangerStep);
      }
      onClose();
    } catch (caught) {
      const message =
        caught instanceof ApiError ? caught.message : 'No se pudo completar la operación';
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-labelledby={titleId}
        aria-modal="true"
        onClick={(event) => {
          event.stopPropagation();
        }}
        data-testid="folder-ops-dialog"
      >
        <h2 id={titleId} className="modal__title">
          {title}
        </h2>
        {kind === 'delete' ? (
          <p className="modal__hint">
            {dangerStep
              ? 'Última confirmación: se borrarán todas las notas de esta carpeta.'
              : `Se eliminarán las notas dentro de «${folder}».`}
          </p>
        ) : (
          <>
            <label className="field">
              <span className="field__label">Carpeta padre</span>
              <input
                className="field__control"
                value={parentInput}
                onChange={(event) => {
                  setParentInput(event.target.value);
                }}
                data-testid="folder-ops-parent"
              />
            </label>
            <label className="field">
              <span className="field__label">Nombre</span>
              <input
                className="field__control"
                value={nameInput}
                onChange={(event) => {
                  setNameInput(event.target.value);
                }}
                data-testid="folder-ops-name"
              />
            </label>
          </>
        )}
        {error !== null ? (
          <p className="modal__error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="modal__actions">
          <button type="button" className="modal__button" onClick={onClose}>
            Cancelar
          </button>
          <button
            type="button"
            className={`modal__button modal__button--primary${kind === 'delete' ? ' modal__button--danger' : ''}`}
            disabled={submitting}
            data-testid="folder-ops-confirm"
            onClick={() => {
              if (kind === 'delete' && !dangerStep) {
                setDangerStep(true);
                return;
              }
              void submit();
            }}
          >
            {submitting
              ? 'Guardando…'
              : kind === 'delete'
                ? dangerStep
                  ? 'Borrar definitivamente'
                  : 'Continuar'
                : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  );
}
