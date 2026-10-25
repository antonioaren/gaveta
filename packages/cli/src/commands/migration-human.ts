import {
  formatDiagnostic,
  type ErrorCode,
  type ExportConflict,
  type ImportFailureReport,
} from '@gaveta/core';
import { getActiveLocale } from '@gaveta/i18n';
import { hm } from '../messages.ts';

function diagnosticReason(code: ErrorCode): string {
  const { message } = formatDiagnostic(code, {}, getActiveLocale());
  return message;
}

export function renderImportFailureLines(
  failures: readonly ImportFailureReport[],
): readonly string[] {
  const lines: string[] = [];
  for (const failure of failures) {
    const target = failure.path ?? failure.sourceMd;
    lines.push(
      hm('cli.human.migration.failure_line', {
        sourceMd: failure.sourceMd,
        target,
        code: failure.code,
        reason: diagnosticReason(failure.code),
      }),
    );
  }
  return lines;
}

export function renderExportConflictLines(conflicts: readonly ExportConflict[]): readonly string[] {
  const lines: string[] = [];
  for (const conflict of conflicts) {
    lines.push(
      hm('cli.human.migration.conflict_line', {
        path: conflict.path,
        code: conflict.code,
        reason: diagnosticReason(conflict.code),
        detail: conflict.detail,
      }),
    );
  }
  return lines;
}
