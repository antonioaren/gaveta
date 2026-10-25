import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags } from '@lezer/highlight';
import type { Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

/** Token colours use CSS variables defined in the code-editor shadow shell stylesheet. */
export const gavetaCodeHighlightStyle = HighlightStyle.define([
  { tag: tags.comment, color: 'var(--gaveta-cm-comment)' },
  { tag: tags.keyword, color: 'var(--gaveta-cm-keyword)' },
  { tag: [tags.string, tags.special(tags.string)], color: 'var(--gaveta-cm-string)' },
  { tag: [tags.atom, tags.bool, tags.number], color: 'var(--gaveta-cm-atom)' },
  { tag: tags.tagName, color: 'var(--gaveta-cm-tag)' },
  { tag: tags.attributeName, color: 'var(--gaveta-cm-attribute)' },
  { tag: tags.className, color: 'var(--gaveta-cm-class)' },
  { tag: tags.propertyName, color: 'var(--gaveta-cm-property)' },
  { tag: tags.bracket, color: 'var(--gaveta-cm-bracket)' },
  { tag: tags.meta, color: 'var(--gaveta-cm-meta)' },
]);

export function gavetaCodeEditorTheme(): Extension {
  return [
    EditorView.theme({
      '&': {
        backgroundColor: 'var(--color-bg)',
        color: 'var(--color-text)',
      },
      '.cm-content': {
        caretColor: 'var(--color-accent)',
      },
      '.cm-cursor, .cm-dropCursor': {
        borderLeftColor: 'var(--color-accent)',
      },
      '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, &.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground':
        {
          backgroundColor: 'color-mix(in srgb, var(--color-accent) 28%, transparent)',
        },
      '.cm-activeLine': {
        backgroundColor: 'color-mix(in srgb, var(--color-accent) 8%, transparent)',
      },
      '.cm-searchMatch': {
        backgroundColor: 'color-mix(in srgb, var(--color-accent-todo) 35%, transparent)',
        outline: '1px solid var(--color-accent-todo)',
      },
      '.cm-searchMatch.cm-searchMatch-selected': {
        backgroundColor: 'color-mix(in srgb, var(--color-accent-todo) 55%, transparent)',
      },
      '.cm-panel.cm-search': {
        backgroundColor: 'var(--color-surface-elevated)',
        color: 'var(--color-text)',
        borderBottom: '1px solid var(--color-border)',
      },
      '.cm-panel.cm-search input, .cm-panel.cm-search button': {
        font: 'inherit',
        color: 'var(--color-text)',
        backgroundColor: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
      },
      '.cm-foldPlaceholder': {
        backgroundColor: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        color: 'var(--color-muted)',
      },
    }),
    syntaxHighlighting(gavetaCodeHighlightStyle, { fallback: true }),
  ];
}
