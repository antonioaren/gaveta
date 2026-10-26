import { lazy, Suspense, useCallback, useEffect, useState, type ReactElement } from 'react';
import { ApiError } from '../api/client.ts';
import { invalidHtmlMessage, saveNoteDocument } from '../api/note-edit.ts';
import { fetchNoteHtml } from '../api/note-read.ts';
import { validateNoteHtml } from '../editor/code/validate-diagnostics.ts';
import { useI18n } from '../i18n/useI18n.ts';
import { OpenInVsCodeButton } from './OpenInVsCodeButton.tsx';
import { NoteMergeView } from './NoteMergeView.tsx';
import { useExternalNoteRevision } from './useExternalNoteRevision.ts';

const LazyCodeNoteEditor = lazy(async () => {
  const module = await import('../editor/code/CodeNoteEditor.tsx');
  return { default: module.CodeNoteEditor };
});

export interface NoteCodeModeProps {
  readonly noteRef: string;
  readonly noteId: string;
  readonly path: string;
  readonly onSaved: (hash: string) => void;
  readonly onExit: () => void;
}

export function NoteCodeMode({
  noteRef,
  noteId,
  path,
  onSaved,
  onExit,
}: NoteCodeModeProps): ReactElement {
  const { t } = useI18n();
  const [html, setHtml] = useState<string | null>(null);
  const [hash, setHash] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [editorEpoch, setEditorEpoch] = useState(0);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [theirsForMerge, setTheirsForMerge] = useState<{ html: string; hash: string } | null>(null);

  const { external, clearExternal } = useExternalNoteRevision(noteRef, noteId, hash);

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

  const openMergeWithTheirs = useCallback((disk: { html: string; hash: string }) => {
    setTheirsForMerge(disk);
    setMergeOpen(true);
    setSaveError(null);
  }, []);

  const handleSave = useCallback(
    (ifMatchOverride?: string) => {
      if (html === null || hash === null || saving) {
        return;
      }
      const match = ifMatchOverride ?? hash;
      if (!dirty) {
        void fetchNoteHtml(noteRef).then((disk) => {
          if (disk.hash !== match) {
            openMergeWithTheirs({ html: disk.html, hash: disk.hash });
            return;
          }
          onSaved(match);
        });
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
          return saveNoteDocument(noteRef, html, match);
        })
        .then((result) => {
          if (result === null) {
            return;
          }
          setHash(result.hash);
          setDirty(false);
          setSaving(false);
          setMergeOpen(false);
          setTheirsForMerge(null);
          clearExternal();
          onSaved(result.hash);
        })
        .catch((error: unknown) => {
          setSaving(false);
          if (error instanceof ApiError) {
            if (error.status === 409 || error.code === 'E_CONFLICT') {
              void fetchNoteHtml(noteRef).then((disk) => {
                openMergeWithTheirs({ html: disk.html, hash: disk.hash });
              });
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
    },
    [clearExternal, dirty, hash, html, noteRef, onSaved, openMergeWithTheirs, path, saving, t],
  );

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

  const theirsHtml = theirsForMerge?.html ?? external?.html ?? html;
  const theirsHash = theirsForMerge?.hash ?? external?.hash ?? hash;

  return (
    <div className="note-code-mode">
      <div className="note-code-mode__toolbar">
        <button type="button" className="note-code-mode__button" onClick={onExit}>
          {t('web.note.code.readView')}
        </button>
        <OpenInVsCodeButton noteRef={noteRef} />
        <button
          type="button"
          className="note-code-mode__button note-code-mode__button--primary"
          onClick={() => {
            handleSave();
          }}
          disabled={saving}
        >
          {saving ? t('web.common.saving') : t('web.common.save')}
        </button>
      </div>
      {external !== null && !mergeOpen ? (
        <div className="note-external-change" role="status" data-testid="note-external-change">
          <p className="note-external-change__text">{t('web.note.externalChange.banner')}</p>
          <button
            type="button"
            className="note-external-change__button"
            data-testid="note-external-change-diff"
            onClick={() => {
              openMergeWithTheirs({ html: external.html, hash: external.hash });
            }}
          >
            {t('web.note.merge.openDiff')}
          </button>
        </div>
      ) : null}
      {saveError !== null ? (
        <p className="note-code-mode__error" role="alert">
          {saveError}
        </p>
      ) : null}
      {mergeOpen ? (
        <NoteMergeView
          yoursHtml={html}
          theirsHtml={theirsHtml}
          saving={saving}
          onAcceptTheirs={() => {
            setHtml(theirsHtml);
            setHash(theirsHash);
            setDirty(false);
            setMergeOpen(false);
            setTheirsForMerge(null);
            clearExternal();
            setEditorEpoch((value) => value + 1);
          }}
          onKeepMine={() => {
            if (theirsHash !== null) {
              handleSave(theirsHash);
            }
          }}
          onClose={() => {
            setMergeOpen(false);
          }}
        />
      ) : null}
      <p className="note-code-mode__hint" data-testid="code-mode-editor-hint">
        {t('web.editor.code.hint.emmet')}
      </p>
      <Suspense
        fallback={
          <p className="note-pane__placeholder" role="status">
            {t('web.note.code.loading')}
          </p>
        }
      >
        <LazyCodeNoteEditor
          key={`${noteRef}-${String(editorEpoch)}`}
          initialValue={html}
          notePath={path}
          onChange={handleChange}
          onSaveRequest={() => {
            handleSave();
          }}
        />
      </Suspense>
    </div>
  );
}
