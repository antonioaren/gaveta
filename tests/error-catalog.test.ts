import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DIAGNOSTICS, diagnosticCodes } from '../packages/core/src/errors.ts';

const root = join(import.meta.dirname, '..');

function read(relativePath: string): string {
  return readFileSync(join(root, relativePath), 'utf8');
}

function codesIn(markdown: string): string[] {
  const found: string[] = [];
  for (const match of markdown.matchAll(/`((?:E|W)_[A-Z0-9_]+)`/g)) {
    const code = match[1];
    found.push(code);
  }
  return found;
}

function catalogTable(markdown: string): string[] {
  const start = markdown.indexOf('**Catálogo inicial de errores y avisos**');
  const end = markdown.indexOf('**Localización del vault:**');
  if (start < 0 || end < 0 || end <= start) {
    throw new Error('the error catalog table is missing from REQUIREMENTS.md');
  }
  return codesIn(markdown.slice(start, end));
}

describe('error catalog matches the docs', () => {
  it('exports the requirements table in order and no other codes', () => {
    const table = catalogTable(read('docs/REQUIREMENTS.md'));
    expect(table.length).toBeGreaterThan(0);
    expect(diagnosticCodes()).toEqual(table);
    expect(Object.keys(DIAGNOSTICS)).toEqual(table);
  });

  it('covers every code mentioned in the product docs', () => {
    const mentioned = new Set<string>();
    for (const path of ['docs/REQUIREMENTS.md', 'docs/PRD.md', 'docs/TASKS.md']) {
      for (const code of codesIn(read(path))) {
        mentioned.add(code);
      }
    }
    const exported = new Set<string>(diagnosticCodes());
    const missing = [...mentioned].filter((code) => !exported.has(code));
    expect(missing).toEqual([]);
  });
});
