import type { Editor } from '@tiptap/core';
import { wikilinkCompletionContextBefore } from './wikilink-query.ts';

export interface VisualWikilinkCompletionContext {
  readonly from: number;
  readonly to: number;
  readonly query: string;
}

export function visualWikilinkCompletionContext(
  editor: Editor,
): VisualWikilinkCompletionContext | null {
  const { $from } = editor.state.selection;
  if (!$from.parent.isTextblock) {
    return null;
  }
  const blockStart = $from.start();
  const blockText = $from.parent.textBetween(0, $from.parentOffset, null, '\ufffc');
  const match = wikilinkCompletionContextBefore(blockText, blockText.length);
  if (match === null) {
    return null;
  }
  return {
    from: blockStart + match.from,
    to: blockStart + match.to,
    query: match.query,
  };
}
