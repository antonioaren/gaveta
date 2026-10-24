import { describe, expect, it } from 'vitest';
import { lineRange, offsetAtLineColumn } from './source-offset.ts';

describe('source-offset', () => {
  it('maps line and column to a UTF-16 offset', () => {
    const source = '<p>a</p>\n<p>b</p>';
    expect(offsetAtLineColumn(source, 1, 1)).toBe(0);
    expect(offsetAtLineColumn(source, 2, 1)).toBe(9);
    expect(offsetAtLineColumn(source, 2, 3)).toBe(11);
  });

  it('returns a line span without the trailing newline', () => {
    const source = 'one\n<script>\ntwo';
    const range = lineRange(source, 2);
    expect(source.slice(range.from, range.to)).toBe('<script>');
  });
});
