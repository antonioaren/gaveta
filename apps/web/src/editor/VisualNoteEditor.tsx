import { noteHtmlToEditorDocument, serializeDocJsonToBodyInnerHtml } from '@gaveta/editor';
import { EditorContent, useEditor } from '@tiptap/react';
import { useMemo, useRef, useState } from 'react';
import { fetchNoteHtml, saveNoteReplace } from '../api/note-write.ts';
import { buildVisualEditorExtensions } from './build-extensions.ts';
import { useI18n } from '../i18n/useI18n.ts';
import { formatMessage } from '@gaveta/i18n';
import { readWebLocale } from '../i18n/read-web-locale.ts';
import { WikilinkCompletionMenu } from './wikilink/WikilinkCompletionMenu.tsx';

export interface VisualNoteEditorProps {
  readonly noteRef: string;
  readonly notePath: string;
  readonly initialHtml: string;
  readonly ifMatch: string;
  readonly onCancel: () => void;
  readonly onSaved: (hash: string) => void;
}

export function VisualNoteEditor({
  noteRef,
  notePath,
  initialHtml,
  ifMatch,
  onCancel,
  onSaved,
}: VisualNoteEditorProps) {
  const { t } = useI18n();
  const shell = useMemo(() => noteHtmlToEditorDocument(initialHtml), [initialHtml]);
  const extensions = useMemo(() => buildVisualEditorExtensions(notePath), [notePath]);
  const baselineBodyInnerRef = useRef<string | null>(null);
  const [ifMatchState, setIfMatchState] = useState(ifMatch);
  const [status, setStatus] = useState<'idle' | 'saving'>('idle');
  const [feedback, setFeedback] = useState<{ tone: 'error' | 'conflict'; message: string } | null>(
    null,
  );

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

  const save = async (): Promise<void> => {
    setStatus('saving');
    setFeedback(null);
    const bodyJson = editor.getJSON();
    const bodyHtml = serializeDocJsonToBodyInnerHtml(bodyJson);
    const unchanged = bodyHtml === baselineBodyInnerRef.current;
    if (unchanged) {
      const current = await fetchNoteHtml(noteRef);
      if (current.hash !== ifMatchState) {
        setStatus('idle');
        setFeedback({
          tone: 'conflict',
          message: t('web.api.error.E_CONFLICT_VISUAL'),
        });
        setIfMatchState(current.hash);
        return;
      }
      setStatus('idle');
      onSaved(ifMatchState);
      return;
    }
    const result = await saveNoteReplace(noteRef, ifMatchState, bodyHtml);
    if (!result.ok) {
      setStatus('idle');
      if (result.status === 409) {
        setFeedback({
          tone: 'conflict',
          message: result.message || t('web.api.error.E_CONFLICT_VISUAL'),
        });
        if (result.hash !== undefined) {
          setIfMatchState(result.hash);
        }
        return;
      }
      setFeedback({
        tone: 'error',
        message: result.message || formatMessage('web.api.error.fallbackSaveNote', readWebLocale()),
      });
      return;
    }
    setIfMatchState(result.hash);
    setStatus('idle');
    onSaved(result.hash);
  };

  return (
    <div className="visual-editor" data-testid="visual-editor">
      <div className="visual-editor__toolbar">
        <button
          type="button"
          className="visual-editor__button visual-editor__button--primary"
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
          className="visual-editor__button"
          data-testid="visual-editor-cancel"
          disabled={status === 'saving'}
          onClick={onCancel}
        >
          {t('web.common.cancel')}
        </button>
      </div>
      {feedback !== null ? (
        <p
          className={`visual-editor__feedback visual-editor__feedback--${feedback.tone}`}
          role="alert"
          data-testid="visual-editor-feedback"
        >
          {feedback.message}
        </p>
      ) : null}
      <EditorContent editor={editor} className="visual-editor__content" />
      <WikilinkCompletionMenu editor={editor} />
    </div>
  );
}
