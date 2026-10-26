// @vitest-environment jsdom
import { expandAbbreviation } from '@emmetio/codemirror6-plugin';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { describe, expect, it, vi } from 'vitest';
import { createCodeEditorExtensions } from './create-code-editor-extensions.ts';

function createTestView(doc: string, cursor: number): EditorView {
  const host = document.createElement('div');
  document.body.appendChild(host);
  return new EditorView({
    state: EditorState.create({
      doc,
      selection: { anchor: cursor },
      extensions: createCodeEditorExtensions({
        locale: 'en',
        notePath: 'n.html',
        readOnly: false,
        fetchValidation: () => Promise.resolve({ diagnostics: [] }),
        onDocChange: vi.fn(),
        onSaveRequest: vi.fn(),
      }),
    }),
    parent: host,
  });
}

describe('code-editor Emmet', () => {
  it('expands a paragraph abbreviation inside markup', () => {
    const prefix = '<html><body><article><section id="cuerpo">';
    const suffix = '</section></article></body></html>';
    const view = createTestView(prefix + suffix, prefix.length);
    view.dispatch({
      changes: { from: prefix.length, insert: 'p' },
      selection: { anchor: prefix.length + 1 },
    });
    expect(expandAbbreviation(view)).toBe(true);
    expect(view.state.doc.toString()).toContain('<p></p>');
    view.destroy();
  });
});
