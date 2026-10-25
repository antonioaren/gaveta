import { formatMessage } from '@gaveta/i18n';
import { expect, it } from 'vitest';
import { formatExportSummary, formatImportSummary } from './migration-summary.ts';

const t = (key: Parameters<typeof formatMessage>[0], params?: Record<string, string | number>) =>
  formatMessage(key, 'es', params ?? {});

it('formats import and export summaries in Spanish', () => {
  const summary = {
    created: 2,
    overwritten: 0,
    renamed: 1,
    skipped: 0,
    failed: 0,
    attachments: 3,
  };
  expect(formatImportSummary(summary, t)).toContain('2 creadas');
  expect(formatExportSummary(summary, t)).toContain('2 notas');
});
