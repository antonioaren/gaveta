import { useCallback, useEffect, useState, type ReactElement } from 'react';
import { ApiError } from '../api/client.ts';
import { CONFLICT_MESSAGE, INVALID_HTML_MESSAGE, saveNoteDocument } from '../api/note-edit.ts';
import { fetchNoteHtml } from '../api/note-read.ts';
import { CodeNoteEditor } from '../editor/code/CodeNoteEditor.tsx';
import { validateNoteHtml } from '../editor/code/validate-diagnostics.ts';

export interface NoteCodeModeProps {
  readonly noteRef: string;
  readonly path: string;
  readonly onSaved: (hash: string) => void;
  readonly onExit: () => void;
}

export function NoteCodeMode({ noteRef, path, onSaved, onExit }: NoteCodeModeProps): ReactElement {
  const [html, setHtml] = useState<string | null>(null);
  const [hash, setHash] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetchNoteHtml(noteRef)
      .then((note) => {
        if (cancelled) {
          return;
        }
        setHtml(note.html);
        setHash(note.hash);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) {
          return;
        }
        setLoadError('No se pudo cargar el HTML de la nota.');
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [noteRef]);

  const handleChange = useCallback((next: string) => {
    setHtml(next);
    setDirty(true);
    setSaveError(null);
  }, []);

  const handleSave = useCallback(() => {
    if (html === null || hash === null || saving) {
      return;
    }
    if (!dirty) {
      onSaved(hash);
      return;
    }
    setSaving(true);
    setSaveError(null);
    void validateNoteHtml(html, path)
      .then((validation) => {
        if (!validation.ok) {
          setSaving(false);
          setSaveError(INVALID_HTML_MESSAGE);
          return null;
        }
        return saveNoteDocument(noteRef, html, hash);
      })
      .then((result) => {
        if (result === null) {
          return;
        }
        setHash(result.hash);
        setDirty(false);
        setSaving(false);
        onSaved(result.hash);
      })
      .catch((error: unknown) => {
        setSaving(false);
        if (error instanceof ApiError) {
          if (error.status === 409 || error.code === 'E_CONFLICT') {
            setSaveError(CONFLICT_MESSAGE);
            return;
          }
          if (error.status === 422 || error.code === 'E_HTML_INVALID') {
            setSaveError(INVALID_HTML_MESSAGE);
            return;
          }
          setSaveError(error.message);
          return;
        }
        setSaveError('No se pudo guardar la nota.');
      });
  }, [dirty, hash, html, onSaved, noteRef, path, saving]);

  if (loading) {
    return (
      <p className="note-pane__placeholder" role="status">
        Cargando modo código…
      </p>
    );
  }

  if (loadError !== null || html === null) {
    return (
      <p className="note-pane__placeholder note-pane__placeholder--error" role="alert">
        {loadError ?? 'No se pudo cargar la nota.'}
      </p>
    );
  }

  return (
    <div className="note-code-mode">
      <div className="note-code-mode__toolbar">
        <button type="button" className="note-code-mode__button" onClick={onExit}>
          Vista lectura
        </button>
        <button
          type="button"
          className="note-code-mode__button note-code-mode__button--primary"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
      {saveError !== null ? (
        <p className="note-code-mode__error" role="alert">
          {saveError}
        </p>
      ) : null}
      <CodeNoteEditor initialValue={html} notePath={path} onChange={handleChange} />
    </div>
  );
}
