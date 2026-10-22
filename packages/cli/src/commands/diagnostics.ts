import type { NoteDiagnostic } from '@gaveta/core';

export interface DiagnosticView {
  readonly code: string;
  readonly severity: 'error' | 'warning';
  readonly message: string;
  readonly hint: string;
  readonly location: { readonly line: number; readonly column: number } | null;
  readonly details: Readonly<Record<string, string | number>> | null;
}

export function presentDiagnostic(diagnostic: NoteDiagnostic): DiagnosticView {
  const location = diagnostic.location;
  return {
    code: diagnostic.code,
    severity: diagnostic.severity,
    message: diagnostic.message,
    hint: diagnostic.hint,
    location: location === null ? null : { line: location.line, column: location.column },
    details: diagnostic.details,
  };
}

export function renderDiagnosticLine(diagnostic: DiagnosticView, path?: string): string {
  const prefix = path === undefined ? '' : `${path}: `;
  const where =
    diagnostic.location === null
      ? ''
      : ` (${String(diagnostic.location.line)}:${String(diagnostic.location.column)})`;
  return `${prefix}${diagnostic.code}${where}: ${diagnostic.message}`;
}
