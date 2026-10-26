import type { Diagnostic } from '@codemirror/lint';
import type { EditorView } from '@codemirror/view';
import type { NoteDiagnosticView } from '../../api/note-validate.ts';
import { lineRange, offsetAtLineColumn } from './source-offset.ts';
import { formatDiagnosticLabel } from './validate-diagnostics.ts';

function diagnosticRange(
  source: string,
  diagnostic: NoteDiagnosticView,
): { from: number; to: number } {
  const location = diagnostic.location;
  if (location === null) {
    return { from: 0, to: source.length };
  }
  const from = offsetAtLineColumn(source, location.line, location.column);
  const line = lineRange(source, location.line);
  if (from >= line.from && from < line.to) {
    return { from, to: Math.max(from + 1, line.to) };
  }
  return line;
}

function shouldSurfaceDiagnostic(diagnostic: NoteDiagnosticView): boolean {
  if (diagnostic.severity === 'error') {
    return true;
  }
  return diagnostic.code.startsWith('W_');
}

export function noteDiagnosticsToCodeMirror(
  source: string,
  diagnostics: readonly NoteDiagnosticView[],
): Diagnostic[] {
  return diagnostics.filter(shouldSurfaceDiagnostic).map((diagnostic) => {
    const { from, to } = diagnosticRange(source, diagnostic);
    return {
      from,
      to,
      severity: diagnostic.severity === 'error' ? 'error' : 'warning',
      message: formatDiagnosticLabel(diagnostic),
    };
  });
}

export function createNoteLinter(
  notePath: string,
  validate: (html: string, path: string) => Promise<{ diagnostics: readonly NoteDiagnosticView[] }>,
): (view: EditorView) => Promise<Diagnostic[]> {
  return (view: EditorView): Promise<Diagnostic[]> => {
    const source = view.state.doc.toString();
    return validate(source, notePath).then((result) =>
      noteDiagnosticsToCodeMirror(source, result.diagnostics),
    );
  };
}
