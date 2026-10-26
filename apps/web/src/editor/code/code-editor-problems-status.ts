import { forEachDiagnostic, setDiagnosticsEffect } from '@codemirror/lint';
import type { Extension } from '@codemirror/state';
import type { EditorState } from '@codemirror/state';
import { formatMessage, type Locale } from '@gaveta/i18n';
import { showPanel, type EditorView, type Panel, type ViewUpdate } from '@codemirror/view';

export interface LintProblemCounts {
  readonly errors: number;
  readonly warnings: number;
}

export function countLintProblems(state: EditorState): LintProblemCounts {
  let errors = 0;
  let warnings = 0;
  forEachDiagnostic(state, (diagnostic) => {
    if (diagnostic.severity === 'error') {
      errors += 1;
    } else if (diagnostic.severity === 'warning') {
      warnings += 1;
    }
  });
  return { errors, warnings };
}

function formatStatusText(locale: Locale, counts: LintProblemCounts): string {
  const errors = formatMessage('web.editor.code.problems.errors', locale, {
    count: String(counts.errors),
  });
  const warnings = formatMessage('web.editor.code.problems.warnings', locale, {
    count: String(counts.warnings),
  });
  return `${errors}, ${warnings}`;
}

class ProblemsStatusPanel implements Panel {
  readonly dom: HTMLDivElement;
  private readonly locale: Locale;

  constructor(view: EditorView, locale: Locale) {
    this.locale = locale;
    this.dom = document.createElement('div');
    this.dom.className = 'cm-gaveta-problems-status';
    this.dom.setAttribute('role', 'status');
    this.dom.dataset.testid = 'code-editor-problems-status';
    this.render(view);
  }

  update(update: ViewUpdate): void {
    const before = countLintProblems(update.startState);
    const after = countLintProblems(update.state);
    const countsChanged = before.errors !== after.errors || before.warnings !== after.warnings;
    const effectsChanged = update.transactions.some((transaction) =>
      transaction.effects.some((effect) => effect.is(setDiagnosticsEffect)),
    );
    if (!update.docChanged && !countsChanged && !effectsChanged) {
      return;
    }
    this.render(update.view);
  }

  private render(view: EditorView): void {
    const counts = countLintProblems(view.state);
    this.dom.textContent = formatStatusText(this.locale, counts);
  }
}

export function codeEditorProblemsStatus(locale: Locale): Extension {
  return showPanel.of((view) => new ProblemsStatusPanel(view, locale));
}
