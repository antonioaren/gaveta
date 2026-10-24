import { BODY_ELEMENTS } from '@gaveta/core';
import { describe, expect, it } from 'vitest';
import { contractElementsMissingFromSchema, schemaRegistrySummary } from './contract-coverage.ts';
import { MARK_TAGS } from './element-kind.ts';
import { tagToNodeName } from './names.ts';

describe('contract-driven TipTap schema', () => {
  it('maps every BODY_ELEMENTS entry to a schema node or mark', () => {
    expect(contractElementsMissingFromSchema()).toEqual([]);
    const summary = schemaRegistrySummary();
    expect(summary.htmlBlock).toBe('htmlBlock');
    for (const entry of BODY_ELEMENTS) {
      expect(summary.mapped).toContain(entry.name);
    }
  });

  it('uses camelCase node names only for hyphenated custom elements', () => {
    for (const entry of BODY_ELEMENTS) {
      const mappedName = tagToNodeName(entry.name);
      if (entry.name.includes('-')) {
        expect(mappedName).not.toContain('-');
      } else if (MARK_TAGS.has(entry.name)) {
        expect(mappedName).toBe(entry.name);
      } else {
        expect(mappedName).toBe(entry.name);
      }
    }
  });
});
