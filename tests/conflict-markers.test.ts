import { describe, expect, it } from 'vitest';
import { findConflictMarkersInText } from './conflict-markers.ts';

describe('findConflictMarkersInText', () => {
  it('detects git conflict markers in plain text', () => {
    const sample = ['line', '<<<<<<< HEAD', 'ours', '=======', 'theirs', '>>>>>>> branch'].join(
      '\n',
    );
    const hits = findConflictMarkersInText(sample, { markdownAware: false });
    expect(hits.map((hit) => hit.kind)).toEqual(['start', 'separator', 'end']);
    expect(hits[0]?.line).toBe(2);
  });

  it('ignores separator lines inside markdown fenced code', () => {
    const sample = [
      '# Doc',
      '',
      '```text',
      '<<<<<<< HEAD',
      '=======',
      '>>>>>>> branch',
      '```',
      '',
      '<<<<<<< HEAD',
    ].join('\n');
    const hits = findConflictMarkersInText(sample, { markdownAware: true });
    expect(hits).toHaveLength(1);
    expect(hits[0]?.line).toBe(9);
    expect(hits[0]?.kind).toBe('start');
  });

  it('returns no hits for clean content', () => {
    const sample = 'normal\ncontent\nwith <tags> and ampersands &';
    expect(findConflictMarkersInText(sample, { markdownAware: false })).toEqual([]);
  });
});
