import { autocompletion, closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { html, autoCloseTags } from '@codemirror/lang-html';
import {
  bracketMatching,
  codeFolding,
  foldGutter,
  foldKeymap,
  indentOnInput,
} from '@codemirror/language';
import { linter, lintGutter, previousDiagnostic } from '@codemirror/lint';
import { vscodeKeymap } from '@replit/codemirror-vscode-keymap';
import { highlightSelectionMatches, search, searchKeymap } from '@codemirror/search';
import { EditorState, type Extension } from '@codemirror/state';
import {
  crosshairCursor,
  drawSelection,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  keymap,
  lineNumbers,
  rectangularSelection,
} from '@codemirror/view';
import type { Locale } from '@gaveta/i18n';
import type { NoteDiagnosticView } from '../../api/note-validate.ts';
import { formatMessage } from '@gaveta/i18n';
import { codeEditorEmmetExtensions } from './code-editor-emmet.ts';
import { codeMirrorPhrasesForLocale } from './code-editor-phrases.ts';
import { codeEditorProblemsStatus } from './code-editor-problems-status.ts';
import { fetchWikilinkCompletions } from '../../api/wikilink-complete.ts';
import { contractHtmlCompletionSource } from './contract-html-completion.ts';
import {
  wikilinkHtmlAutocompleteTrigger,
  wikilinkHtmlCompletionSource,
} from '../wikilink/wikilink-html-completion.ts';
import { gavetaCodeEditorTheme } from './code-editor-theme.ts';
import { openReplacePanel } from './code-editor-panels.ts';
import { createNoteLinter } from './note-linter.ts';

export interface CreateCodeEditorExtensionsOptions {
  readonly locale: Locale;
  readonly notePath: string;
  readonly readOnly: boolean;
  readonly fetchValidation: (
    html: string,
    path: string,
  ) => Promise<{ diagnostics: readonly NoteDiagnosticView[] }>;
  readonly onDocChange: (value: string) => void;
  readonly onSaveRequest: () => void;
  readonly onFormatDocument?: () => void;
}

export function createCodeEditorExtensions({
  locale,
  notePath,
  readOnly,
  fetchValidation,
  onDocChange,
  onSaveRequest,
  onFormatDocument,
}: CreateCodeEditorExtensionsOptions): Extension[] {
  const noteLinter = createNoteLinter(notePath, fetchValidation);
  const phrases = codeMirrorPhrasesForLocale(locale);

  return [
    EditorState.phrases.of(phrases),
    gavetaCodeEditorTheme(),
    lineNumbers(),
    highlightActiveLineGutter(),
    highlightActiveLine(),
    highlightSpecialChars(),
    drawSelection(),
    indentOnInput(),
    bracketMatching(),
    closeBrackets(),
    html(),
    autoCloseTags,
    autocompletion({
      activateOnTyping: true,
      defaultKeymap: true,
      maxRenderedOptions: 20,
      override: [
        wikilinkHtmlCompletionSource(fetchWikilinkCompletions, {
          section: formatMessage('web.editor.wikilink.completion.section', locale),
          aliasDetail: (alias) =>
            formatMessage('web.editor.wikilink.completion.aliasDetail', locale, { alias }),
        }),
        (context) => {
          const result = contractHtmlCompletionSource(context);
          if (result === null) {
            return null;
          }
          const contractElementDetail = formatMessage(
            'web.editor.code.completion.contract',
            locale,
          );
          return {
            ...result,
            options: result.options.map((option) =>
              option.type === 'type' ? { ...option, detail: contractElementDetail } : option,
            ),
          };
        },
      ],
    }),
    wikilinkHtmlAutocompleteTrigger(),
    ...codeEditorEmmetExtensions(),
    foldGutter(),
    codeFolding(),
    search({ top: true }),
    highlightSelectionMatches(),
    rectangularSelection(),
    crosshairCursor(),
    lintGutter(),
    linter(noteLinter, { delay: 300 }),
    codeEditorProblemsStatus(locale),
    EditorView.lineWrapping,
    EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        onDocChange(update.state.doc.toString());
      }
    }),
    EditorView.editable.of(!readOnly),
    keymap.of([
      {
        key: 'Mod-s',
        run: () => {
          onSaveRequest();
          return true;
        },
        preventDefault: true,
      },
      { key: 'Mod-h', run: openReplacePanel, preventDefault: true },
      {
        key: 'Shift-Mod-f',
        run: () => {
          onFormatDocument?.();
          return true;
        },
        preventDefault: true,
      },
      { key: 'Shift-F8', run: previousDiagnostic, preventDefault: true },
    ]),
    keymap.of([...closeBracketsKeymap, ...searchKeymap, ...foldKeymap, ...vscodeKeymap]),
  ];
}
