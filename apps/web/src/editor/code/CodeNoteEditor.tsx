import { html } from '@codemirror/lang-html';
import { defaultHighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { linter, lintGutter } from '@codemirror/lint';
import { EditorState } from '@codemirror/state';
import { EditorView, lineNumbers, highlightActiveLineGutter } from '@codemirror/view';
import { useEffect, useRef, type ReactElement } from 'react';
import { fetchNoteValidation } from '../../api/note-validate.ts';
import { ensureCodeEditorShadowMount } from './code-editor-shadow.ts';
import { createNoteLinter } from './note-linter.ts';
import { useI18n } from '../../i18n/useI18n.ts';

export interface CodeNoteEditorProps {
  readonly initialValue: string;
  readonly notePath: string;
  readonly onChange: (value: string) => void;
  readonly readOnly?: boolean;
}

export function CodeNoteEditor({
  initialValue,
  notePath,
  onChange,
  readOnly = false,
}: CodeNoteEditorProps): ReactElement {
  const { t } = useI18n();
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    const host = hostRef.current;
    if (host === null) {
      return;
    }
    const { shadowRoot, mount } = ensureCodeEditorShadowMount(host);
    const noteLinter = createNoteLinter(notePath, fetchNoteValidation);
    const view = new EditorView({
      state: EditorState.create({
        doc: initialValue,
        extensions: [
          lineNumbers(),
          highlightActiveLineGutter(),
          html(),
          syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
          lintGutter(),
          linter(noteLinter, { delay: 300 }),
          EditorView.lineWrapping,
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              onChangeRef.current(update.state.doc.toString());
            }
          }),
          EditorView.editable.of(!readOnly),
        ],
      }),
      parent: mount,
      root: shadowRoot,
    });
    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, [initialValue, notePath, readOnly]);

  return (
    <div
      className="code-editor"
      ref={hostRef}
      aria-label={t('web.editor.code.aria')}
      data-testid="code-note-editor"
    />
  );
}
