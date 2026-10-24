import { expect, it } from 'vitest';
import { parseTagsInput } from './parse-tags.ts';

it('parses comma-separated unique tags', () => {
  expect(parseTagsInput('a, b ,c,a')).toEqual(['a', 'b', 'c']);
  expect(parseTagsInput('  , ,')).toEqual([]);
});
