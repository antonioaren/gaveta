import {
  formatDiagnostic,
  type ErrorCode,
  type ExportConflict,
  type ImportFailureReport,
} from '@gaveta/core';

function spanishReason(code: ErrorCode): string {
  const { message } = formatDiagnostic(code);
  return message;
}

export function renderImportFailureLines(
  failures: readonly ImportFailureReport[],
): readonly string[] {
  const lines: string[] = [];
  for (const failure of failures) {
    const target = failure.path ?? failure.sourceMd;
    lines.push(
      `- ${failure.sourceMd} → ${target}: ${failure.code} — ${spanishReason(failure.code)}`,
    );
  }
  return lines;
}

export function renderExportConflictLines(conflicts: readonly ExportConflict[]): readonly string[] {
  const lines: string[] = [];
  for (const conflict of conflicts) {
    lines.push(
      `- ${conflict.path}: ${conflict.code} — ${spanishReason(conflict.code)} (${conflict.detail})`,
    );
  }
  return lines;
}
