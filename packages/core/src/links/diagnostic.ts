import { DIAGNOSTICS, formatDiagnostic, type DiagnosticCode } from '../errors.ts';
import type { SourceLocation } from '../parser.ts';
import type { LinkDiagnostic } from './types.ts';

export function linkDiagnostic(
  code: DiagnosticCode,
  location: SourceLocation | null,
  params: Readonly<Record<string, string | number>>,
  details: Readonly<Record<string, unknown>> | null,
  severity?: 'error' | 'warning',
): LinkDiagnostic {
  const text = formatDiagnostic(code, params);
  return {
    code,
    severity: severity ?? DIAGNOSTICS[code].severity,
    message: text.message,
    hint: text.hint,
    location,
    details,
  };
}
