// @vitest-environment jsdom
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { formatMessage } from '@gaveta/i18n';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { formatNoteHtml } from '../../api/format-note.ts';
import { setActiveCodeEditorHost } from './code-editor-host.ts';
import {
  codeEditorPaletteCommands,
  runCodeEditorPaletteCommand,
} from './code-editor-palette-commands.ts';

vi.mock('../../api/format-note.ts', () => ({
  formatNoteHtml: vi.fn(),
}));

const t = (key: Parameters<typeof formatMessage>[0]) => formatMessage(key, 'en');

beforeEach(() => {
  vi.mocked(formatNoteHtml).mockReset();
});

afterEach(() => {
  setActiveCodeEditorHost(null);
});

describe('codeEditorPaletteCommands', () => {
  it('lists format, find, replace, and save commands', () => {
    const ids = codeEditorPaletteCommands(t).map((command) => command.id);
    expect(ids).toEqual(['code-format-document', 'code-find', 'code-replace', 'code-save']);
  });

  it('formats the active document through the API', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const view = new EditorView({
      state: EditorState.create({ doc: '<p>x</p>' }),
      parent: host,
    });
    let applied = '';
    vi.mocked(formatNoteHtml).mockResolvedValue({
      ok: true,
      html: '<article><p>x</p></article>',
      diagnostics: [],
      errorCount: 0,
    });
    setActiveCodeEditorHost({
      notePath: 'n.html',
      view,
      getDoc: () => view.state.doc.toString(),
      applyDoc: (html) => {
        applied = html;
        view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: html } });
      },
      onFormatError: () => {
        /* noop */
      },
      onSaveRequest: () => {
        /* noop */
      },
    });

    const ran = await runCodeEditorPaletteCommand('code-format-document');
    expect(ran).toBe(true);
    expect(formatNoteHtml).toHaveBeenCalledWith('<p>x</p>', 'n.html');
    expect(applied).toContain('<article>');
    view.destroy();
    host.remove();
  });
});
