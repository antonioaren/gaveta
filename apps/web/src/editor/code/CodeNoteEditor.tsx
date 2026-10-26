import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { useEffect, useRef, type ReactElement } from 'react';
import { fetchNoteValidation } from '../../api/note-validate.ts';
import { ensureCodeEditorShadowMount } from './code-editor-shadow.ts';
import { runCodeEditorPaletteCommand } from './code-editor-palette-commands.ts';
import { setActiveCodeEditorHost } from './code-editor-host.ts';
import { createCodeEditorExtensions } from './create-code-editor-extensions.ts';
import { useI18n } from '../../i18n/useI18n.ts';
import type { MessageKey } from '@gaveta/i18n';

export interface CodeNoteEditorProps {
  readonly initialValue: string;
  readonly notePath: string;
  readonly onChange: (value: string) => void;
  readonly onSaveRequest: () => void;
  readonly onFormatError?: (messageKey: MessageKey) => void;
  readonly readOnly?: boolean;
}

export function CodeNoteEditor({
  initialValue,
  notePath,
  onChange,
  onSaveRequest,
  onFormatError,
  readOnly = false,
}: CodeNoteEditorProps): ReactElement {
  const { t, locale } = useI18n();
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const onSaveRef = useRef(onSaveRequest);
  const onFormatErrorRef = useRef(onFormatError);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    onSaveRef.current = onSaveRequest;
  }, [onSaveRequest]);

  useEffect(() => {
    onFormatErrorRef.current = onFormatError;
  }, [onFormatError]);

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
          onFormatDocument: () => {
            void runCodeEditorPaletteCommand('code-format-document');
          },
        }),
      }),
      parent: mount,
      root: shadowRoot,
    });
    viewRef.current = view;
    setActiveCodeEditorHost({
      notePath,
      view,
      getDoc: () => view.state.doc.toString(),
      applyDoc: (html) => {
        view.dispatch({
          changes: { from: 0, to: view.state.doc.length, insert: html },
        });
        onChangeRef.current(html);
      },
      onFormatError: (messageKey) => {
        onFormatErrorRef.current?.(messageKey);
      },
      onSaveRequest: () => {
        onSaveRef.current();
      },
    });
    return () => {
      setActiveCodeEditorHost(null);
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
