import type { MigrationActionSummary } from '../api/migration-types.ts';
import type { WebTranslate } from '../new-note/format-api-error.ts';

export function formatImportSummary(summary: MigrationActionSummary, t: WebTranslate): string {
  return [
    t('web.migration.summary.import.created', { count: summary.created }),
    t('web.migration.summary.import.overwritten', { count: summary.overwritten }),
    t('web.migration.summary.import.renamed', { count: summary.renamed }),
    t('web.migration.summary.import.skipped', { count: summary.skipped }),
    t('web.migration.summary.import.failed', { count: summary.failed }),
    t('web.migration.summary.import.attachments', { count: summary.attachments }),
  ].join(', ');
}

export function formatExportSummary(summary: MigrationActionSummary, t: WebTranslate): string {
  return [
    t('web.migration.summary.export.notes', { count: summary.created }),
    t('web.migration.summary.export.attachments', { count: summary.attachments }),
    t('web.migration.summary.export.conflicts', { count: summary.failed }),
  ].join(', ');
}
