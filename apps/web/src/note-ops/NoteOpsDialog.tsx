import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { ApiError } from '../api/client.ts';
import type { BacklinkView } from '../api/types.ts';
import { fetchNoteRead } from '../api/read-note.ts';
import { postMoveNote, postRemoveNote } from '../api/write-note.ts';
import { apiJson } from '../api/client.ts';
import type { BacklinksResponse } from '../api/types.ts';
import { moveDestinationPath, renameDestinationPath } from './note-destination.ts';
import { splitNotePath } from '../explorer/build-tree.ts';
import type { NoteListItem } from '../api/types.ts';
import { notifyLocalNoteRemoved } from '../live/local-note-events.ts';
import { useTabs } from '../tabs/useTabs.ts';
import type { NoteOpKind, NoteOpTarget } from './note-op-target.ts';

interface NoteOpsDialogProps {
  readonly kind: NoteOpKind;
  readonly target: NoteOpTarget;
  readonly notes: readonly NoteListItem[];
  readonly onClose: () => void;
  readonly onConflictRefresh: () => void;
}

const CONFLICT_MESSAGE =
  'La nota ha cambiado desde la última lectura. Se ha actualizado la vista; vuelve a intentarlo si aún aplica.';

export function NoteOpsDialog({
  kind,
  target,
  notes,
  onClose,
  onConflictRefresh,
}: NoteOpsDialogProps) {
  const titleId = useId();
  const tabState = useTabs();
  const initialFolder = splitNotePath(target.path).folder;
  const [titleInput, setTitleInput] = useState(target.title);
  const [folderInput, setFolderInput] = useState(initialFolder);
  const [hash, setHash] = useState<string | null>(null);
  const [backlinks, setBacklinks] = useState<readonly BacklinkView[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dangerStep, setDangerStep] = useState(false);

  const folderOptions = useMemo(() => {
    const folders = new Set<string>();
    for (const note of notes) {
      const { folder } = splitNotePath(note.path);
      if (folder.length > 0) {
        folders.add(folder);
      }
    }
    return [...folders].sort((a, b) => a.localeCompare(b, 'es'));
  }, [notes]);

  const destinationPreview = useMemo(() => {
    if (kind === 'rename') {
      return renameDestinationPath(
        target.path,
        titleInput,
        notes.map((note) => note.path),
      );
    }
    if (kind === 'move') {
      return moveDestinationPath(target.path, folderInput);
    }
    return null;
  }, [folderInput, kind, notes, target, titleInput]);

  const reloadMeta = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const read = await fetchNoteRead(target.ref);
      setHash(read.hash);
      const backlinksEnvelope = await apiJson<BacklinksResponse>(
        `/api/backlinks?ref=${encodeURIComponent(target.ref)}`,
      );
      setBacklinks(backlinksEnvelope.data.backlinks);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'No se pudo cargar la nota';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [target]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-open for dialog metadata
    void reloadMeta();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once per dialog mount (keyed by target)
  }, []);

  const applyTabUpdate = useCallback(
    (fromPath: string, toPath: string, noteId: string | null, newTitle: string) => {
      tabState.remapNotePath(fromPath, toPath, noteId, newTitle);
    },
    [tabState],
  );

  const finishMove = useCallback(
    (from: string, to: string, noteId: string | null, newTitle: string) => {
      applyTabUpdate(from, to, noteId, newTitle);
      onClose();
    },
    [applyTabUpdate, onClose],
  );

  const onSubmit = useCallback(async () => {
    if (hash === null) {
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      if (kind === 'delete') {
        const force = dangerStep || backlinks.length === 0;
        if (backlinks.length > 0 && !dangerStep) {
          setError(
            'Esta nota tiene enlaces entrantes. Confirma el borrado forzado para continuar.',
          );
          setSubmitting(false);
          return;
        }
        await postRemoveNote(target.ref, hash, force);
        notifyLocalNoteRemoved(target.noteId, target.path);
        onClose();
        return;
      }
      const destination = destinationPreview;
      if (destination === null || destination === target.path) {
        setError('Indica un destino válido distinto del actual.');
        setSubmitting(false);
        return;
      }
      const moved = await postMoveNote(target.ref, destination, hash);
      const newTitle = kind === 'rename' ? titleInput.trim() : target.title;
      finishMove(moved.from, moved.to, moved.id, newTitle);
    } catch (caught) {
      if (caught instanceof ApiError && caught.code === 'E_CONFLICT') {
        onConflictRefresh();
        await reloadMeta();
        setError(CONFLICT_MESSAGE);
      } else if (caught instanceof ApiError && caught.code === 'E_HAS_BACKLINKS') {
        setError('La nota tiene enlaces entrantes y no se puede borrar sin forzar.');
      } else {
        const message =
          caught instanceof Error ? caught.message : 'No se pudo completar la operación';
        setError(message);
      }
    } finally {
      setSubmitting(false);
    }
  }, [
    backlinks.length,
    dangerStep,
    destinationPreview,
    finishMove,
    hash,
    kind,
    onClose,
    onConflictRefresh,
    reloadMeta,
    target,
    titleInput,
  ]);

  const dialogTitle =
    kind === 'rename' ? 'Renombrar nota' : kind === 'move' ? 'Mover nota' : 'Borrar nota';

  const primaryLabel =
    kind === 'rename'
      ? 'Renombrar'
      : kind === 'move'
        ? 'Mover'
        : dangerStep
          ? 'Borrar definitivamente'
          : 'Borrar';

  return (
    <dialog open className="note-ops-dialog" aria-labelledby={titleId} onClose={onClose}>
      <form
        method="dialog"
        className="note-ops-dialog__panel"
        onSubmit={(event) => {
          event.preventDefault();
          void onSubmit();
        }}
      >
        <header className="note-ops-dialog__header">
          <h2 id={titleId} className="note-ops-dialog__title">
            {dialogTitle}
          </h2>
          <p className="note-ops-dialog__subtitle">{target.title}</p>
        </header>

        {loading ? <p className="note-ops-dialog__status">Cargando enlaces entrantes…</p> : null}

        {kind === 'rename' ? (
          <label className="field">
            <span className="field__label">Nuevo título</span>
            <input
              className="field__control"
              value={titleInput}
              onChange={(event) => {
                setTitleInput(event.target.value);
              }}
              data-testid="note-rename-title"
            />
          </label>
        ) : null}

        {kind === 'move' ? (
          <label className="field">
            <span className="field__label">Carpeta de destino</span>
            <input
              className="field__control"
              list="note-move-folders"
              value={folderInput}
              onChange={(event) => {
                setFolderInput(event.target.value);
              }}
              data-testid="note-move-folder"
            />
            <datalist id="note-move-folders">
              {folderOptions.map((folder) => (
                <option key={folder} value={folder} />
              ))}
            </datalist>
          </label>
        ) : null}

        {destinationPreview !== null && kind !== 'delete' ? (
          <p className="note-ops-dialog__preview">
            Destino: <code>{destinationPreview}</code>
          </p>
        ) : null}

        <section className="note-ops-dialog__backlinks" aria-label="Enlaces entrantes">
          <h3 className="note-ops-dialog__backlinks-title">
            Enlaces entrantes ({backlinks.length})
          </h3>
          {kind === 'delete' && backlinks.length > 0 ? (
            <p className="note-ops-dialog__warning">
              No se puede borrar mientras otras notas enlacen aquí. Puedes forzar el borrado y
              convertir esos enlaces en pendientes.
            </p>
          ) : null}
          {kind !== 'delete' && backlinks.length > 0 ? (
            <p className="note-ops-dialog__hint">
              Se reescribirán los enlaces entrantes en {backlinks.length}{' '}
              {backlinks.length === 1 ? 'nota' : 'notas'}.
            </p>
          ) : null}
          <ul className="note-ops-dialog__backlink-list">
            {backlinks.map((link) => (
              <li key={`${link.sourcePath}:${link.text}`} className="note-ops-dialog__backlink">
                <span className="note-ops-dialog__backlink-source">{link.sourceTitle}</span>
                <span className="note-ops-dialog__backlink-context">{link.context}</span>
              </li>
            ))}
          </ul>
        </section>

        {error !== null ? (
          <p className="note-ops-dialog__error" role="alert">
            {error}
          </p>
        ) : null}

        <footer className="note-ops-dialog__actions">
          <button type="button" className="button button--ghost" onClick={onClose}>
            Cancelar
          </button>
          {kind === 'delete' && backlinks.length > 0 && !dangerStep ? (
            <button
              type="button"
              className="button button--danger"
              data-testid="note-delete-force"
              onClick={() => {
                setDangerStep(true);
                setError(null);
              }}
            >
              Borrar con fuerza
            </button>
          ) : null}
          <button
            type="submit"
            className={`button${kind === 'delete' ? ' button--danger' : ''}`}
            disabled={submitting || loading || hash === null}
            data-testid="note-ops-confirm"
          >
            {primaryLabel}
          </button>
        </footer>
      </form>
    </dialog>
  );
}
