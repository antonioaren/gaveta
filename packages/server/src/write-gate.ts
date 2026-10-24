import { exitCodeFor, GavetaError, type NoteWarning } from '@gaveta/core';
import { warningFromCode, type ApiWarning } from './envelope.ts';

export function mapNoteWarnings(warnings: readonly NoteWarning[]): ApiWarning[] {
  return warnings.map((warning) => warningFromCode(warning.code, warning.params));
}

export function assertNoteWriteOk(result: {
  readonly ok: boolean;
  readonly warnings: readonly NoteWarning[];
}): void {
  if (result.ok) {
    return;
  }
  const escalating = result.warnings.some((warning) => exitCodeFor(warning.code) !== null);
  if (!escalating) {
    throw new GavetaError('E_HTML_INVALID');
  }
  throw new GavetaError('E_HTML_INVALID');
}
