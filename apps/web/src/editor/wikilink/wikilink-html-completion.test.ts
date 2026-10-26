// @vitest-environment jsdom
import { CompletionContext } from '@codemirror/autocomplete';
import { EditorState } from '@codemirror/state';
import { describe, expect, it, vi } from 'vitest';
import { wikilinkHtmlCompletionSource } from './wikilink-html-completion.ts';

describe('wikilinkHtmlCompletionSource', () => {
  it('offers note titles when the cursor is inside [[', async () => {
    const fetchCompletions = vi.fn(() =>
      Promise.resolve([
        {
          id: '01M5HGV8800000000000000002',
          title: 'Destino enlace',
          path: 'destino-enlace.html',
          matchedBy: 'title' as const,
          matchedLabel: 'Destino enlace',
          score: 1,
        },
      ]),
    );
    const state = EditorState.create({
      doc: '<p>Ver [[Dest',
    });
    const context = new CompletionContext(state, state.doc.length, true);
    const raw = wikilinkHtmlCompletionSource(fetchCompletions, {
      section: 'Notes',
      aliasDetail: (alias) => `Alias: ${alias}`,
    })(context);
    const result = await Promise.resolve(raw);
    expect(result).not.toBeNull();
    if (result === null) {
      return;
    }
    const options = await Promise.resolve(result.options);
    expect(fetchCompletions).toHaveBeenCalledWith('Dest');
    expect(options[0]?.label).toBe('Destino enlace');
    expect(options[0]?.apply).toBe('Destino enlace]]');
  });
});
