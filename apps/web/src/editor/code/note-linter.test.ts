// @vitest-environment jsdom
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { describe, expect, it } from 'vitest';
import { createNoteLinter } from './note-linter.ts';

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
