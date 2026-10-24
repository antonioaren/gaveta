import { expect, it } from 'vitest';
import { formatExportSummary, formatImportSummary } from './migration-summary.ts';

it('formats import and export summaries in Spanish', () => {
  const summary = {
    created: 2,
    overwritten: 0,
    renamed: 1,
    skipped: 0,
    failed: 0,
    attachments: 3,
  };
  expect(formatImportSummary(summary)).toContain('2 creadas');
  expect(formatExportSummary(summary)).toContain('2 notas');
});
