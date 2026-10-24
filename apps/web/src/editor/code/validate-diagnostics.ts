import { fetchNoteValidation, type NoteDiagnosticView } from '../../api/note-validate.ts';

export interface NoteValidationView {
  readonly ok: boolean;
  readonly diagnostics: readonly NoteDiagnosticView[];
  readonly errorCount: number;
}

export async function validateNoteHtml(
  html: string,
  notePath: string,
): Promise<NoteValidationView> {
  return fetchNoteValidation(html, notePath);
}

export function formatDiagnosticLabel(diagnostic: NoteDiagnosticView): string {
  return `${diagnostic.code}: ${diagnostic.message}`;
}
