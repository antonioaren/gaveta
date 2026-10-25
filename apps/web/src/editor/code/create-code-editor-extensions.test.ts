// @vitest-environment jsdom
import { EditorState } from '@codemirror/state';
import { EditorView, runScopeHandlers } from '@codemirror/view';
import { openSearchPanel, searchKeymap, selectNextOccurrence } from '@codemirror/search';
import { vscodeKeymap } from '@replit/codemirror-vscode-keymap';
import { describe, expect, it, vi } from 'vitest';
import { codeMirrorPhrasesForLocale } from './code-editor-phrases.ts';
import { createCodeEditorExtensions } from './create-code-editor-extensions.ts';

function createTestView(
  doc: string,
  onSaveRequest: () => void,
  locale: 'en' | 'es' = 'es',
): { view: EditorView; host: HTMLDivElement } {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const view = new EditorView({
    state: EditorState.create({
      doc,
      extensions: createCodeEditorExtensions({
        locale,
        notePath: 'n.html',
        readOnly: false,
        fetchValidation: () => Promise.resolve({ diagnostics: [] }),
        onDocChange: () => {
          /* noop */
        },
        onSaveRequest,
      }),
    }),
    parent: host,
  });
  return { view, host };
}

function keyMod(view: EditorView, key: string): void {
  view.focus();
  const event = new KeyboardEvent('keydown', {
    key,
    code: `Key${key.toUpperCase()}`,
    ctrlKey: true,
    bubbles: true,
    cancelable: true,
  });
  runScopeHandlers(view, event, 'editor');
}

describe('createCodeEditorExtensions', () => {
  it('maps CodeMirror phrases from the active locale', () => {
    const es = codeMirrorPhrasesForLocale('es');
    const en = codeMirrorPhrasesForLocale('en');
    expect(es.Find).toBe('Buscar');
    expect(en.Find).toBe('Find');
  });

  it('renders a fold gutter for code folding', () => {
    const { view, host } = createTestView('<section></section>', () => {
      /* noop */
    });
    expect(host.querySelector('.cm-foldGutter')).not.toBeNull();
    view.destroy();
    host.remove();
  });

  it('localizes the search panel via EditorState.phrases', () => {
    const { view, host } = createTestView('<p>x</p>', () => {
      /* noop */
    });
    openSearchPanel(view);
    const panel = host.querySelector('.cm-panel.cm-search');
    expect(panel?.textContent).toContain('siguiente');
    view.destroy();
    host.remove();
  });

  it('wires search and VS Code keymaps (Mod-d → selectNextOccurrence)', () => {
    const modD = searchKeymap.find((binding) => binding.key === 'Mod-d');
    expect(modD?.run).toBe(selectNextOccurrence);
    expect(vscodeKeymap.length).toBeGreaterThan(0);
  });

  it('invokes onSaveRequest on Mod-s', () => {
    const onSave = vi.fn();
    const { view, host } = createTestView('<p>x</p>', onSave);
    keyMod(view, 's');
    expect(onSave).toHaveBeenCalledOnce();
    view.destroy();
    host.remove();
  });
});
