import { expect, it } from 'vitest';
import { renderExportConflictLines, renderImportFailureLines } from './migration-human.ts';

it('renders import failures with codes and Spanish reasons', () => {
  const lines = renderImportFailureLines([
    { sourceMd: 'broken/invalid.md', path: 'broken/invalid.html', code: 'E_IMPORT_PARSE' },
  ]);
  expect(lines[0]).toContain('broken/invalid.md');
  expect(lines[0]).toContain('E_IMPORT_PARSE');
  expect(lines[0]).toContain('interpretar');
});

it('renders export conflicts with codes', () => {
  const lines = renderExportConflictLines([
    { path: 'nota.md', code: 'E_PATH_EXISTS', detail: 'exists' },
  ]);
  expect(lines[0]).toContain('nota.md');
  expect(lines[0]).toContain('E_PATH_EXISTS');
});
