// @vitest-environment jsdom
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithI18n } from '../../i18n/render-with-i18n.tsx';
import { CodeNoteEditor } from './CodeNoteEditor.tsx';

describe('CodeNoteEditor mount', () => {
  it('mounts CodeMirror inside an open shadow root', async () => {
    const { container } = renderWithI18n(
      <CodeNoteEditor
        initialValue="<p>hola</p>"
        notePath="nota.html"
        onChange={() => {
          /* noop */
        }}
      />,
    );
    const host = container.querySelector('[data-testid="code-note-editor"]');
    expect(host).not.toBeNull();
    await waitFor(() => {
      expect(host?.shadowRoot).not.toBeNull();
      expect(host?.shadowRoot?.querySelector('.cm-editor')).not.toBeNull();
    });
    expect(host?.shadowRoot?.querySelector('.cm-content')).not.toBeNull();
  });

  it('passes shadow root as EditorView root when created directly', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const shadowRoot = host.attachShadow({ mode: 'open' });
    const mount = document.createElement('div');
    shadowRoot.appendChild(mount);
    const view = new EditorView({
      state: EditorState.create({ doc: 'x' }),
      parent: mount,
      root: shadowRoot,
    });
    expect(shadowRoot.contains(view.dom)).toBe(true);
    view.destroy();
    host.remove();
  });
});
