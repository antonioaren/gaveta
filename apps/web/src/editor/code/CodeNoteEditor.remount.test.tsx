// @vitest-environment jsdom
import { EditorView } from '@codemirror/view';
import { waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithI18n } from '../../i18n/render-with-i18n.tsx';
import { CodeNoteEditor } from './CodeNoteEditor.tsx';

describe('CodeNoteEditor remount', () => {
  it('keeps the same CodeMirror view when initialValue prop changes after mount', async () => {
    const onChange = vi.fn();
    const { container, rerender } = renderWithI18n(
      <CodeNoteEditor
        initialValue="<p>a</p>"
        notePath="nota.html"
        onChange={onChange}
        onSaveRequest={() => {
          /* noop */
        }}
      />,
    );
    const host = container.querySelector('[data-testid="code-note-editor"]');
    expect(host).not.toBeNull();
    await waitFor(() => {
      expect(host?.shadowRoot?.querySelector('.cm-editor')).not.toBeNull();
    });
    const editorEl = host?.shadowRoot?.querySelector('.cm-editor');
    expect(editorEl).not.toBeNull();

    rerender(
      <CodeNoteEditor
        initialValue="<p>parent-updated</p>"
        notePath="nota.html"
        onChange={onChange}
        onSaveRequest={() => {
          /* noop */
        }}
      />,
    );

    expect(host?.shadowRoot?.querySelector('.cm-editor')).toBe(editorEl);
    if (editorEl === null || !(editorEl instanceof HTMLElement)) {
      throw new Error('expected code editor element');
    }
    const view = EditorView.findFromDOM(editorEl);
    expect(view?.state.doc.toString()).toBe('<p>a</p>');
  });
});
