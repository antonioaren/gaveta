/** FTS highlight markers from `@gaveta/core` (`SEARCH_SNIPPET_START` / `END`). */
export const SNIPPET_MARK_START = '<mark>';
export const SNIPPET_MARK_END = '</mark>';

export type SnippetPart =
  | { readonly kind: 'text'; readonly value: string }
  | { readonly kind: 'mark'; readonly value: string };

/** Parse snippet text into safe React-friendly parts (no raw HTML). */
export function parseSnippetHighlight(snippet: string): readonly SnippetPart[] {
  const parts: SnippetPart[] = [];
  let index = 0;
  while (index < snippet.length) {
    const markStart = snippet.indexOf(SNIPPET_MARK_START, index);
    if (markStart === -1) {
      pushPlainText(parts, snippet.slice(index));
      break;
    }
    pushPlainText(parts, snippet.slice(index, markStart));
    const contentStart = markStart + SNIPPET_MARK_START.length;
    const markEnd = snippet.indexOf(SNIPPET_MARK_END, contentStart);
    if (markEnd === -1) {
      pushPlainText(parts, snippet.slice(markStart));
      break;
    }
    const marked = stripInlineTags(snippet.slice(contentStart, markEnd));
    if (marked.length > 0) {
      parts.push({ kind: 'mark', value: marked });
    }
    index = markEnd + SNIPPET_MARK_END.length;
  }
  return parts;
}

function pushPlainText(parts: SnippetPart[], chunk: string): void {
  const plain = stripInlineTags(chunk);
  if (plain.length > 0) {
    parts.push({ kind: 'text', value: plain });
  }
}

function stripInlineTags(value: string): string {
  let out = '';
  let index = 0;
  while (index < value.length) {
    const lt = value.indexOf('<', index);
    if (lt === -1) {
      out += value.slice(index);
      break;
    }
    out += value.slice(index, lt);
    const gt = value.indexOf('>', lt + 1);
    if (gt === -1) {
      break;
    }
    index = gt + 1;
  }
  return out;
}
