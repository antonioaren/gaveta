// @vitest-environment jsdom
import { nextDiagnostic, previousDiagnostic, setDiagnostics } from '@codemirror/lint';
import { EditorState } from '@codemirror/state';
import { EditorView, runScopeHandlers } from '@codemirror/view';
import { describe, expect, it } from 'vitest';
import { createCodeEditorExtensions } from './create-code-editor-extensions.ts';

describe('code editor problems navigation', () => {
  it('moves between diagnostics with F8 and Shift-F8', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const view = new EditorView({
      state: EditorState.create({
        doc: 'abcdefgh',
        extensions: createCodeEditorExtensions({
          locale: 'en',
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
        { from: 0, to: 2, severity: 'warning', message: 'W_ONE: a' },
        { from: 4, to: 6, severity: 'error', message: 'E_TWO: b' },
      ]),
    );
    expect(nextDiagnostic(view)).toBe(true);
    view.focus();
    const forward = runScopeHandlers(
      view,
      new KeyboardEvent('keydown', { key: 'F8', code: 'F8', bubbles: true, cancelable: true }),
      'editor',
    );
    expect(forward).toBe(true);
    const backward = runScopeHandlers(
      view,
      new KeyboardEvent('keydown', {
        key: 'F8',
        code: 'F8',
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      }),
      'editor',
    );
    expect(backward).toBe(true);
    view.destroy();
    host.remove();
  });

  it('exposes previousDiagnostic for Shift-F8 bindings', () => {
    expect(previousDiagnostic).toBeTypeOf('function');
    expect(nextDiagnostic).toBeTypeOf('function');
  });
});
