import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
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
import {
  highlightSelectionMatches,
  openSearchPanel,
  search,
  searchKeymap,
} from '@codemirror/search';
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
import { createNoteLinter } from './note-linter.ts';
import { codeMirrorPhrasesForLocale } from './code-editor-phrases.ts';
import { codeEditorProblemsStatus } from './code-editor-problems-status.ts';
import { gavetaCodeEditorTheme } from './code-editor-theme.ts';

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
}

function openReplacePanel(view: EditorView): boolean {
  openSearchPanel(view);
  const replaceField = view.dom.querySelector<HTMLInputElement>(
    '.cm-panel.cm-search input[name="replace"]',
  );
  replaceField?.focus();
  replaceField?.select();
  return true;
}

export function createCodeEditorExtensions({
  locale,
  notePath,
  readOnly,
  fetchValidation,
  onDocChange,
  onSaveRequest,
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
      { key: 'Shift-F8', run: previousDiagnostic, preventDefault: true },
    ]),
    keymap.of([...closeBracketsKeymap, ...searchKeymap, ...foldKeymap, ...vscodeKeymap]),
  ];
}
