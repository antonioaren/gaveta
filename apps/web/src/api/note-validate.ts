import { apiJson } from './client.ts';

export interface NoteDiagnosticView {
  readonly code: string;
  readonly severity: 'error' | 'warning';
  readonly message: string;
  readonly hint: string;
  readonly location: { readonly line: number; readonly column: number } | null;
}

export interface NoteValidationResponse {
  readonly ok: boolean;
  readonly diagnostics: readonly NoteDiagnosticView[];
  readonly errorCount: number;
}

export async function fetchNoteValidation(
  html: string,
  notePath: string,
): Promise<NoteValidationResponse> {
  const envelope = await apiJson<NoteValidationResponse>('/api/validate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ html, path: notePath }),
  });
  return envelope.data;
}
