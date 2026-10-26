// @vitest-environment jsdom
import { autocompletion } from '@codemirror/autocomplete';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  wikilinkHtmlAutocompleteTrigger,
  wikilinkHtmlCompletionSource,
} from './wikilink-html-completion.ts';

describe('wikilinkHtmlAutocompleteTrigger', () => {
  let mount: HTMLDivElement | undefined;
  let view: EditorView | undefined;

  afterEach(() => {
    if (view !== undefined) {
      view.destroy();
      view = undefined;
    }
    if (mount !== undefined) {
      mount.remove();
      mount = undefined;
    }
  });

  it('opens the completion panel after a programmatic insert inside [[', async () => {
    const fetchCompletions = vi.fn(() =>
      Promise.resolve([
        {
          id: '01',
          title: 'Formas de enlace',
          path: 'formas-de-enlace.html',
          matchedBy: 'title' as const,
          matchedLabel: 'Formas de enlace',
          score: 1,
        },
      ]),
    );
    const mountEl = document.createElement('div');
    mount = mountEl;
    document.body.appendChild(mountEl);
    view = new EditorView({
      parent: mountEl,
      state: EditorState.create({
        doc: '<p>tail</p>',
        extensions: [
          autocompletion({
            activateOnTyping: true,
            override: [
              wikilinkHtmlCompletionSource(fetchCompletions, {
                section: 'Notes',
                aliasDetail: (alias) => alias,
              }),
            ],
          }),
          wikilinkHtmlAutocompleteTrigger(),
        ],
      }),
    });
    const from = view.state.doc.length;
    view.dispatch({
      changes: { from, insert: '\n[[Form' },
      selection: { anchor: from + '\n[[Form'.length },
    });
    await vi.waitFor(() => {
      expect(mountEl.querySelector('.cm-tooltip-autocomplete')).not.toBeNull();
    });
    expect(fetchCompletions).toHaveBeenCalledWith('Form');
  });
});
