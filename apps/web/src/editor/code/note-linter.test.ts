// @vitest-environment jsdom
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { describe, expect, it } from 'vitest';
import { createNoteLinter, noteDiagnosticsToCodeMirror } from './note-linter.ts';

describe('createNoteLinter', () => {
  it('surfaces validator codes in lint messages', async () => {
    const host = document.createElement('div');
    const view = new EditorView({
      state: EditorState.create({ doc: '<script>x</script>' }),
      parent: host,
    });
    const diagnostics = await createNoteLinter('nota.html', () =>
      Promise.resolve({
        diagnostics: [
          {
            code: 'E_UNSAFE_SCRIPT',
            severity: 'error',
            message: 'Script no permitido.',
            hint: 'Quita el script.',
            location: { line: 1, column: 1 },
          },
        ],
      }),
    )(view);
    view.destroy();
    expect(diagnostics.length).toBeGreaterThan(0);
    expect(diagnostics[0]?.message).toMatch(/^E_UNSAFE_SCRIPT:/);
  });
});

describe('noteDiagnosticsToCodeMirror', () => {
  const source = '<a data-g-pending="Roadmap">Roadmap</a>';

  it('maps W_* warnings to CodeMirror warning diagnostics', () => {
    const mapped = noteDiagnosticsToCodeMirror(source, [
      {
        code: 'W_LINK_PENDING',
        severity: 'warning',
        message: 'Enlace pendiente.',
        hint: 'Crea la nota o enlaza un id.',
        location: { line: 1, column: 1 },
      },
    ]);
    expect(mapped).toHaveLength(1);
    expect(mapped[0]?.severity).toBe('warning');
    expect(mapped[0]?.message).toBe('W_LINK_PENDING: Enlace pendiente.');
  });

  it('ignores non-W_* warnings', () => {
    const mapped = noteDiagnosticsToCodeMirror(source, [
      {
        code: 'INFO_OTHER',
        severity: 'warning',
        message: 'noop',
        hint: '',
        location: null,
      },
    ]);
    expect(mapped).toHaveLength(0);
  });
});
