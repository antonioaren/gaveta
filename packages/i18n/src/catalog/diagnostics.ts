import diagnosticsEn from './diagnostics.en.json' with { type: 'json' };
import diagnosticsEs from './diagnostics.es.json' with { type: 'json' };

export type DiagnosticCode = keyof typeof diagnosticsEs;

export type DiagnosticField = 'message' | 'hint';

export type DiagnosticMessageKey = `diagnostics.${DiagnosticCode}.${DiagnosticField}`;

function flattenDiagnostics(table: typeof diagnosticsEs): Record<DiagnosticMessageKey, string> {
  const out: Partial<Record<DiagnosticMessageKey, string>> = {};
  for (const code of Object.keys(table) as DiagnosticCode[]) {
    const entry = table[code];
    out[`diagnostics.${code}.message`] = entry.message;
    out[`diagnostics.${code}.hint`] = entry.hint;
  }
  return out as Record<DiagnosticMessageKey, string>;
}

export const diagnosticMessagesEn = flattenDiagnostics(diagnosticsEn);
export const diagnosticMessagesEs = flattenDiagnostics(diagnosticsEs);
