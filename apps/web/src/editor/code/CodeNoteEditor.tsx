import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { useEffect, useRef, type ReactElement } from 'react';
import { fetchNoteValidation } from '../../api/note-validate.ts';
import { ensureCodeEditorShadowMount } from './code-editor-shadow.ts';
import { createCodeEditorExtensions } from './create-code-editor-extensions.ts';
import { useI18n } from '../../i18n/useI18n.ts';

export interface CodeNoteEditorProps {
  readonly initialValue: string;
  readonly notePath: string;
  readonly onChange: (value: string) => void;
  readonly onSaveRequest: () => void;
  readonly readOnly?: boolean;
}

export function CodeNoteEditor({
  initialValue,
  notePath,
  onChange,
  onSaveRequest,
  readOnly = false,
}: CodeNoteEditorProps): ReactElement {
  const { t, locale } = useI18n();
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const onSaveRef = useRef(onSaveRequest);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    onSaveRef.current = onSaveRequest;
  }, [onSaveRequest]);

  useEffect(() => {
    const host = hostRef.current;
    if (host === null) {
      return;
    }
    const { shadowRoot, mount } = ensureCodeEditorShadowMount(host);
    const view = new EditorView({
      state: EditorState.create({
        doc: initialValue,
        extensions: createCodeEditorExtensions({
          locale,
          notePath,
          readOnly,
          fetchValidation: fetchNoteValidation,
          onDocChange: (value) => {
            onChangeRef.current(value);
          },
          onSaveRequest: () => {
            onSaveRef.current();
          },
        }),
      }),
      parent: mount,
      root: shadowRoot,
    });
    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, [initialValue, locale, notePath, readOnly]);

  return (
    <div
      className="code-editor"
      ref={hostRef}
      aria-label={t('web.editor.code.aria')}
      data-testid="code-note-editor"
    />
  );
}
