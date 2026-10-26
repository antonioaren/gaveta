import { openSearchPanel } from '@codemirror/search';
import type { EditorView } from '@codemirror/view';

export function openReplacePanel(view: EditorView): boolean {
  openSearchPanel(view);
  const replaceField = view.dom.querySelector<HTMLInputElement>(
    '.cm-panel.cm-search input[name="replace"]',
  );
  replaceField?.focus();
  replaceField?.select();
  return true;
}
