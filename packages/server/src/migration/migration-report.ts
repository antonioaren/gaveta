import type { ExportVaultReport, ImportMarkdownFolderResult, ImportNoteReport } from '@gaveta/core';

export interface MigrationActionSummary {
  readonly created: number;
  readonly overwritten: number;
  readonly renamed: number;
  readonly skipped: number;
  readonly failed: number;
  readonly attachments: number;
}

export interface ImportApiData {
  readonly ok: boolean;
  readonly dryRun: boolean;
  readonly summary: MigrationActionSummary;
  readonly notes: ImportMarkdownFolderResult['notes'];
  readonly failures: ImportMarkdownFolderResult['failures'];
  readonly attachments: ImportMarkdownFolderResult['attachments'];
}

export interface ExportApiData {
  readonly ok: boolean;
  readonly dryRun: boolean;
  readonly blocked: boolean;
  readonly outDir: string;
  readonly summary: MigrationActionSummary;
  readonly notes: ExportVaultReport['notes'];
  readonly attachments: ExportVaultReport['attachments'];
  readonly conflicts: ExportVaultReport['conflicts'];
}

export function summarizeImportNotes(notes: readonly ImportNoteReport[]): MigrationActionSummary {
  let created = 0;
  let overwritten = 0;
  let renamed = 0;
  let skipped = 0;
  for (const note of notes) {
    if (note.action === 'create') {
      created += 1;
    } else if (note.action === 'overwrite') {
      overwritten += 1;
    } else if (note.action === 'rename') {
      renamed += 1;
    } else {
      skipped += 1;
    }
  }
  return {
    created,
    overwritten,
    renamed,
    skipped,
    failed: 0,
    attachments: 0,
  };
}

export function buildImportApiData(result: ImportMarkdownFolderResult): ImportApiData {
  const summary = summarizeImportNotes(result.notes);
  return {
    ok: result.ok,
    dryRun: result.dryRun,
    summary: {
      ...summary,
      failed: result.failures.length,
      attachments: result.attachments.length,
    },
    notes: result.notes,
    failures: result.failures,
    attachments: result.attachments,
  };
}

export function buildExportApiData(report: ExportVaultReport): ExportApiData {
  const exported = report.notes.length;
  return {
    ok: !report.blocked,
    dryRun: report.dryRun,
    blocked: report.blocked,
    outDir: report.outDir,
    summary: {
      created: exported,
      overwritten: 0,
      renamed: 0,
      skipped: 0,
      failed: report.conflicts.length,
      attachments: report.attachments.length,
    },
    notes: report.notes,
    attachments: report.attachments,
    conflicts: report.conflicts,
  };
}
