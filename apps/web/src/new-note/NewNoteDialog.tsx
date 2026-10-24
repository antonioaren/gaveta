import { useId, useMemo, useState, type SubmitEvent } from 'react';
import type { NoteListItem } from '../api/types.ts';
import { useTabs } from '../tabs/useTabs.ts';
import { collectFolderPaths } from './collect-folders.ts';
import { createNoteViaApi } from './create-note-api.ts';
import { formatApiError } from './format-api-error.ts';
import type { NewNoteDraft } from './new-note-dialog-context-state.ts';
import { CREATE_NOTE_TYPE_LABELS, CREATE_NOTE_TYPES, type CreateNoteType } from './note-types.ts';
import { parseTagsInput } from './parse-tags.ts';
import { previewNotePath } from './preview-note-path.ts';
import { useNewNoteDialog } from './useNewNoteDialog.ts';

interface NewNoteDialogProps {
  readonly notes: readonly NoteListItem[];
}

function draftFormKey(draft: NewNoteDraft | null): string {
  if (draft === null) {
    return 'closed';
  }
  return JSON.stringify(draft);
}

function initialType(draft: NewNoteDraft): CreateNoteType {
  const candidate = draft.type;
  if (candidate !== undefined && (CREATE_NOTE_TYPES as readonly string[]).includes(candidate)) {
    return candidate as CreateNoteType;
  }
  return 'doc';
}

export function NewNoteDialog({ notes }: NewNoteDialogProps) {
  const { isOpen, draft, closeNewNote } = useNewNoteDialog();
  if (!isOpen || draft === null) {
    return null;
  }
  return (
    <NewNoteDialogForm
      key={draftFormKey(draft)}
      notes={notes}
      draft={draft}
      onClose={closeNewNote}
    />
  );
}

function NewNoteDialogForm({
  notes,
  draft,
  onClose,
}: {
  readonly notes: readonly NoteListItem[];
  readonly draft: NewNoteDraft;
  readonly onClose: () => void;
}) {
  const tabState = useTabs();
  const titleId = useId();
  const titleFieldId = `${titleId}-title`;
  const typeFieldId = `${titleId}-type`;
  const folderFieldId = `${titleId}-folder`;
  const tagsFieldId = `${titleId}-tags`;
  const [title, setTitle] = useState(draft.title ?? '');
  const [type, setType] = useState<CreateNoteType>(() => initialType(draft));
  const [folder, setFolder] = useState(draft.folder ?? '');
  const [tagsRaw, setTagsRaw] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const folders = useMemo(() => collectFolderPaths(notes), [notes]);
  const pathPreview = useMemo(() => previewNotePath(title, folder, notes), [title, folder, notes]);

  const onSubmit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = title.trim();
    if (trimmed.length === 0) {
      setFieldError('Escribe un título para la nota.');
      return;
    }
    setFieldError(null);
    setSubmitError(null);
    setSubmitting(true);
    void (async () => {
      try {
        const created = await createNoteViaApi({
          title: trimmed,
          type,
          folder,
          tags: parseTagsInput(tagsRaw),
        });
        const replaceRef = draft.replaceTabRef;
        if (replaceRef !== undefined && tabState.tabs.some((tab) => tab.ref === replaceRef)) {
          tabState.closeTab(replaceRef);
        }
        tabState.openTab(created.id, created.title, created.path, created.id);
        onClose();
      } catch (caught) {
        setSubmitError(formatApiError(caught));
      } finally {
        setSubmitting(false);
      }
    })();
  };

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal new-note-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => {
          event.stopPropagation();
        }}
      >
        <header className="modal__header">
          <h2 id={titleId} className="modal__title">
            Nueva nota
          </h2>
          <p className="modal__hint">
            Atajo: Ctrl+Alt+N (⌃⌥N en macOS). Evitamos Ctrl+N porque abre una ventana nueva del
            navegador.
          </p>
        </header>
        <form className="modal__body" onSubmit={onSubmit} noValidate>
          <label className="field" htmlFor={titleFieldId}>
            <span className="field__label">Título</span>
            <input
              id={titleFieldId}
              className="field__control"
              type="text"
              value={title}
              autoFocus
              required
              onChange={(event) => {
                setTitle(event.target.value);
              }}
            />
          </label>
          <p className="new-note-dialog__path-preview" aria-live="polite">
            Ruta prevista: <code>{pathPreview}</code>
          </p>
          <label className="field" htmlFor={typeFieldId}>
            <span className="field__label">Tipo</span>
            <select
              id={typeFieldId}
              className="field__control"
              value={type}
              onChange={(event) => {
                setType(event.target.value as CreateNoteType);
              }}
            >
              {CREATE_NOTE_TYPES.map((option) => (
                <option key={option} value={option}>
                  {CREATE_NOTE_TYPE_LABELS[option]}
                </option>
              ))}
            </select>
          </label>
          <label className="field" htmlFor={folderFieldId}>
            <span className="field__label">Carpeta</span>
            <select
              id={folderFieldId}
              className="field__control"
              value={folder}
              onChange={(event) => {
                setFolder(event.target.value);
              }}
            >
              {folders.map((entry) => (
                <option key={entry || 'root'} value={entry}>
                  {entry.length === 0 ? 'Raíz del vault' : entry}
                </option>
              ))}
            </select>
          </label>
          <label className="field" htmlFor={tagsFieldId}>
            <span className="field__label">Etiquetas</span>
            <input
              id={tagsFieldId}
              className="field__control"
              type="text"
              placeholder="Separadas por comas"
              value={tagsRaw}
              onChange={(event) => {
                setTagsRaw(event.target.value);
              }}
            />
          </label>
          {fieldError !== null ? (
            <p className="modal__error" role="alert">
              {fieldError}
            </p>
          ) : null}
          {submitError !== null ? (
            <p className="modal__error" role="alert">
              {submitError}
            </p>
          ) : null}
          <footer className="modal__footer">
            <button type="button" className="topbar__button" onClick={onClose}>
              Cancelar
            </button>
            <button
              type="submit"
              className="topbar__button topbar__button--primary"
              disabled={submitting}
            >
              {submitting ? 'Creando…' : 'Crear nota'}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}
