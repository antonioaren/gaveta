import { useCallback, useEffect, useState, type ReactElement } from 'react';
import { ApiError } from '../api/client.ts';
import { conflictEditMessage, invalidHtmlMessage, saveNoteDocument } from '../api/note-edit.ts';
import { fetchNoteHtml } from '../api/note-read.ts';
import { CodeNoteEditor } from '../editor/code/CodeNoteEditor.tsx';
import { validateNoteHtml } from '../editor/code/validate-diagnostics.ts';
import { useI18n } from '../i18n/useI18n.ts';

export interface NoteCodeModeProps {
  readonly noteRef: string;
  readonly path: string;
  readonly onSaved: (hash: string) => void;
  readonly onExit: () => void;
}

export function NoteCodeMode({ noteRef, path, onSaved, onExit }: NoteCodeModeProps): ReactElement {
  const { t } = useI18n();
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
        setLoadError(t('web.api.error.fallbackLoadNoteHtml'));
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [noteRef, t]);

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
          setSaveError(invalidHtmlMessage());
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
            setSaveError(conflictEditMessage());
            return;
          }
          if (error.status === 422 || error.code === 'E_HTML_INVALID') {
            setSaveError(invalidHtmlMessage());
            return;
          }
          setSaveError(error.message);
          return;
        }
        setSaveError(t('web.api.error.fallbackSaveNoteDot'));
      });
  }, [dirty, hash, html, onSaved, noteRef, path, saving, t]);

  if (loading) {
    return (
      <p className="note-pane__placeholder" role="status">
        {t('web.note.code.loading')}
      </p>
    );
  }

  if (loadError !== null || html === null) {
    return (
      <p className="note-pane__placeholder note-pane__placeholder--error" role="alert">
        {loadError ?? t('web.api.error.fallbackLoadNoteDot')}
      </p>
    );
  }

  return (
    <div className="note-code-mode">
      <div className="note-code-mode__toolbar">
        <button type="button" className="note-code-mode__button" onClick={onExit}>
          {t('web.note.code.readView')}
        </button>
        <button
          type="button"
          className="note-code-mode__button note-code-mode__button--primary"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? t('web.common.saving') : t('web.common.save')}
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
