import { noteHtmlToEditorDocument, serializeDocJsonToBodyInnerHtml } from '@gaveta/editor';
import { EditorContent, useEditor } from '@tiptap/react';
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { fetchNoteHtml, saveNoteReplace } from '../api/note-write.ts';
import { buildVisualEditorExtensions } from './build-extensions.ts';
import { useI18n } from '../i18n/useI18n.ts';
import { formatMessage } from '@gaveta/i18n';
import { readWebLocale } from '../i18n/read-web-locale.ts';
import { NoteMergeView } from '../note/NoteMergeView.tsx';
import { useExternalNoteRevision } from '../note/useExternalNoteRevision.ts';
import { WikilinkCompletionMenu } from './wikilink/WikilinkCompletionMenu.tsx';

export interface VisualNoteEditorHandle {
  save: () => void;
  cancel: () => void;
  readonly saving: boolean;
}

export interface VisualNoteEditorProps {
  readonly noteRef: string;
  readonly noteId: string;
  readonly notePath: string;
  readonly initialHtml: string;
  readonly ifMatch: string;
  readonly onCancel: () => void;
  readonly onSaved: (hash: string) => void;
  readonly onReload: (html: string, hash: string) => void;
  readonly showToolbar?: boolean;
  readonly onSavingChange?: (saving: boolean) => void;
}

export const VisualNoteEditor = forwardRef<VisualNoteEditorHandle, VisualNoteEditorProps>(
  function VisualNoteEditor(
    {
      noteRef,
      noteId,
      notePath,
      initialHtml,
      ifMatch,
      onCancel,
      onSaved,
      onReload,
      showToolbar = false,
      onSavingChange,
    },
    ref,
  ) {
    const { t } = useI18n();
    const shell = useMemo(() => noteHtmlToEditorDocument(initialHtml), [initialHtml]);
    const extensions = useMemo(() => buildVisualEditorExtensions(notePath), [notePath]);
    const baselineBodyInnerRef = useRef<string | null>(null);
    const [ifMatchState, setIfMatchState] = useState(ifMatch);
    const [status, setStatus] = useState<'idle' | 'saving'>('idle');
    const saving = status === 'saving';

    useEffect(() => {
      onSavingChange?.(saving);
    }, [onSavingChange, saving]);
    const [feedback, setFeedback] = useState<{
      tone: 'error' | 'conflict';
      message: string;
    } | null>(null);
    const [mergeOpen, setMergeOpen] = useState(false);
    const [theirsForMerge, setTheirsForMerge] = useState<{ html: string; hash: string } | null>(
      null,
    );

    const { external, clearExternal } = useExternalNoteRevision(noteRef, noteId, ifMatchState);

    const editor = useEditor({
      extensions,
      content: shell.body,
      editable: true,
      editorProps: {
        attributes: {
          class: 'visual-editor__surface',
          'data-testid': 'visual-editor-surface',
        },
      },
      onCreate({ editor: created }) {
        baselineBodyInnerRef.current = serializeDocJsonToBodyInnerHtml(created.getJSON());
      },
    });

    const currentBodyHtml = (): string => serializeDocJsonToBodyInnerHtml(editor.getJSON());

    const openMergeWithTheirs = (disk: { html: string; hash: string }): void => {
      setTheirsForMerge(disk);
      setMergeOpen(true);
      setFeedback(null);
    };

    const resolveTheirs = async (hashHint?: string): Promise<{ html: string; hash: string }> => {
      if (external !== null) {
        return { html: external.html, hash: external.hash };
      }
      const disk = await fetchNoteHtml(noteRef);
      if (hashHint !== undefined && disk.hash !== hashHint) {
        return { html: disk.html, hash: disk.hash };
      }
      return { html: disk.html, hash: disk.hash };
    };

    const save = async (ifMatchOverride?: string): Promise<void> => {
      setStatus('saving');
      setFeedback(null);
      const bodyHtml = currentBodyHtml();
      const unchanged = bodyHtml === baselineBodyInnerRef.current;
      const match = ifMatchOverride ?? ifMatchState;
      if (unchanged) {
        const current = await fetchNoteHtml(noteRef);
        if (current.hash !== match) {
          setStatus('idle');
          openMergeWithTheirs({ html: current.html, hash: current.hash });
          return;
        }
        setStatus('idle');
        onSaved(match);
        return;
      }
      const result = await saveNoteReplace(noteRef, match, bodyHtml);
      if (!result.ok) {
        setStatus('idle');
        if (result.status === 409) {
          const disk = await resolveTheirs(result.hash);
          openMergeWithTheirs(disk);
          return;
        }
        setFeedback({
          tone: 'error',
          message:
            result.message || formatMessage('web.api.error.fallbackSaveNote', readWebLocale()),
        });
        return;
      }
      setIfMatchState(result.hash);
      setMergeOpen(false);
      setTheirsForMerge(null);
      clearExternal();
      setStatus('idle');
      onSaved(result.hash);
    };

    const saveRef = useRef(save);
    saveRef.current = save;

    useImperativeHandle(
      ref,
      () => ({
        save: () => {
          void saveRef.current();
        },
        cancel: onCancel,
        saving,
      }),
      [onCancel, saving],
    );

    const theirsHtml = theirsForMerge?.html ?? external?.html ?? initialHtml;
    const theirsHash = theirsForMerge?.hash ?? external?.hash ?? ifMatchState;

    return (
      <div className="visual-editor" data-testid="visual-editor">
        {showToolbar ? (
          <div className="visual-editor__toolbar">
            <button
              type="button"
              className="ui-btn ui-btn--primary ui-btn--sm"
              data-testid="visual-editor-save"
              disabled={status === 'saving'}
              onClick={() => {
                void save();
              }}
            >
              {status === 'saving' ? t('web.common.saving') : t('web.common.save')}
            </button>
            <button
              type="button"
              className="ui-btn ui-btn--ghost ui-btn--sm"
              data-testid="visual-editor-cancel"
              disabled={status === 'saving'}
              onClick={onCancel}
            >
              {t('web.common.cancel')}
            </button>
          </div>
        ) : null}
        {external !== null && !mergeOpen ? (
          <div className="note-external-change" role="status" data-testid="note-external-change">
            <p className="note-external-change__text">{t('web.note.externalChange.banner')}</p>
            <button
              type="button"
              className="ui-btn ui-btn--ghost ui-btn--sm"
              data-testid="note-external-change-diff"
              onClick={() => {
                openMergeWithTheirs({ html: external.html, hash: external.hash });
              }}
            >
              {t('web.note.merge.openDiff')}
            </button>
          </div>
        ) : null}
        {feedback !== null ? (
          <p
            className={`visual-editor__feedback visual-editor__feedback--${feedback.tone}`}
            role="alert"
            data-testid="visual-editor-feedback"
          >
            {feedback.message}
          </p>
        ) : null}
        {mergeOpen ? (
          <NoteMergeView
            yoursHtml={currentBodyHtml()}
            theirsHtml={theirsHtml}
            saving={status === 'saving'}
            onAcceptTheirs={() => {
              onReload(theirsHtml, theirsHash);
              setIfMatchState(theirsHash);
              setMergeOpen(false);
              setTheirsForMerge(null);
              clearExternal();
              editor.commands.setContent(noteHtmlToEditorDocument(theirsHtml).body);
              baselineBodyInnerRef.current = serializeDocJsonToBodyInnerHtml(editor.getJSON());
            }}
            onKeepMine={() => {
              void save(theirsHash);
            }}
            onClose={() => {
              setMergeOpen(false);
            }}
          />
        ) : null}
        <EditorContent editor={editor} className="visual-editor__content" />
        <WikilinkCompletionMenu editor={editor} />
      </div>
    );
  },
);
