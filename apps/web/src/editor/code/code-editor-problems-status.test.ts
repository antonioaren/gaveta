// @vitest-environment jsdom
import { linter, setDiagnostics } from '@codemirror/lint';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { describe, expect, it } from 'vitest';
import { countLintProblems } from './code-editor-problems-status.ts';
import { createCodeEditorExtensions } from './create-code-editor-extensions.ts';

describe('countLintProblems', () => {
  it('counts errors and warnings from lint diagnostics', () => {
    const host = document.createElement('div');
    const view = new EditorView({
      state: EditorState.create({
        doc: 'abcdef',
        extensions: [linter(() => [])],
      }),
      parent: host,
    });
    view.dispatch(
      setDiagnostics(view.state, [
        { from: 0, to: 1, severity: 'error', message: 'E_ONE: x' },
        { from: 2, to: 3, severity: 'warning', message: 'W_TWO: y' },
        { from: 4, to: 5, severity: 'warning', message: 'W_THREE: z' },
      ]),
    );
    expect(countLintProblems(view.state)).toEqual({ errors: 1, warnings: 2 });
    view.destroy();
  });
});

describe('code editor problems status bar', () => {
  it('renders localized problem counts in the editor panel', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const view = new EditorView({
      state: EditorState.create({
        doc: '<p>x</p>',
        extensions: createCodeEditorExtensions({
          locale: 'es',
          notePath: 'n.html',
          readOnly: false,
          fetchValidation: () => Promise.resolve({ diagnostics: [] }),
          onDocChange: () => {
            /* noop */
          },
          onSaveRequest: () => {
            /* noop */
          },
        }),
      }),
      parent: host,
    });
    view.dispatch(
      setDiagnostics(view.state, [
        { from: 0, to: 1, severity: 'error', message: 'E_TEST: err' },
        { from: 2, to: 3, severity: 'warning', message: 'W_TEST: warn' },
      ]),
    );
    const status = host.querySelector('.cm-gaveta-problems-status');
    expect(status?.textContent).toMatch(/1/);
    expect(status?.textContent).toMatch(/error/i);
    expect(status?.textContent).toMatch(/advertencia/i);
    view.destroy();
    host.remove();
  });
});
