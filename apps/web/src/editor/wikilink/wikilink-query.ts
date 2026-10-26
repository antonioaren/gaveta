export interface WikilinkCompletionContext {
  readonly from: number;
  readonly to: number;
  readonly query: string;
}

/**
 * When the cursor is inside an open `[[…` wikilink, returns the replace range and query.
 */
export function wikilinkCompletionContextBefore(
  text: string,
  cursor: number,
): WikilinkCompletionContext | null {
  if (!Number.isInteger(cursor) || cursor < 0 || cursor > text.length) {
    return null;
  }
  const before = text.slice(0, cursor);
  const open = before.lastIndexOf('[[');
  if (open < 0) {
    return null;
  }
  const segment = before.slice(open + 2);
  if (segment.includes(']]')) {
    return null;
  }
  const pipe = segment.indexOf('|');
  if (pipe >= 0) {
    return null;
  }
  const tagBreak = segment.search(/[<>]/);
  if (tagBreak === 0) {
    return null;
  }
  const query = tagBreak < 0 ? segment : segment.slice(0, tagBreak);
  const to = tagBreak < 0 ? cursor : open + 2 + tagBreak;
  return {
    from: open + 2,
    to,
    query,
  };
}
