import type { MigrationActionSummary } from '../api/migration-types.ts';

export function formatImportSummary(summary: MigrationActionSummary): string {
  return [
    `${String(summary.created)} creadas`,
    `${String(summary.overwritten)} sobrescritas`,
    `${String(summary.renamed)} renombradas`,
    `${String(summary.skipped)} omitidas`,
    `${String(summary.failed)} fallidas`,
    `${String(summary.attachments)} adjuntos`,
  ].join(', ');
}

export function formatExportSummary(summary: MigrationActionSummary): string {
  return [
    `${String(summary.created)} notas`,
    `${String(summary.attachments)} adjuntos`,
    `${String(summary.failed)} conflictos`,
  ].join(', ');
}
