import { apiJson } from './client.ts';
import type { NoteDiagnosticView } from './note-validate.ts';

export interface FormatNoteResponse {
  readonly ok: boolean;
  readonly html: string;
  readonly diagnostics: readonly NoteDiagnosticView[];
  readonly errorCount: number;
}

export async function formatNoteHtml(html: string, notePath: string): Promise<FormatNoteResponse> {
  const envelope = await apiJson<FormatNoteResponse>('/api/format-note', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ html, path: notePath }),
  });
  return envelope.data;
}
