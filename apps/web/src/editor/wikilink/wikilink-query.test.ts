import { describe, expect, it } from 'vitest';
import { wikilinkCompletionContextBefore } from './wikilink-query.ts';

describe('wikilinkCompletionContextBefore', () => {
  it('detects an open wikilink before the cursor', () => {
    const text = '<p>Ver [[Dest';
    const context = wikilinkCompletionContextBefore(text, text.length);
    expect(context).toEqual({ from: 9, to: text.length, query: 'Dest' });
  });

  it('ignores closed wikilinks, pipes, and tag-like segments', () => {
    expect(wikilinkCompletionContextBefore('[[done]] [[open', 15)).toEqual({
      from: 11,
      to: 15,
      query: 'open',
    });
    expect(wikilinkCompletionContextBefore('[[a|b', 5)).toBeNull();
    expect(wikilinkCompletionContextBefore('[[<tag', 7)).toBeNull();
  });
});
