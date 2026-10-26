import { describe, expect, it } from 'vitest';
import { diffLines } from './diff-lines.ts';

describe('diffLines', () => {
  it('marks removed and added lines between two texts', () => {
    const left = 'a\nb\nc';
    const right = 'a\nx\nc';
    expect(diffLines(left, right)).toEqual([
      { kind: 'context', text: 'a' },
      { kind: 'remove', text: 'b' },
      { kind: 'add', text: 'x' },
      { kind: 'context', text: 'c' },
    ]);
  });

  it('treats identical texts as all context', () => {
    const text = '<p>same</p>';
    expect(diffLines(text, text)).toEqual([{ kind: 'context', text: '<p>same</p>' }]);
  });
});
