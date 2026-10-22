import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import { validateNote, validateVault, type ValidationResult } from '@gaveta/core';
import { MALICIOUS } from './catalog.ts';
import { NFR_SEED, generateVault } from './generate.ts';
import { vaultPath, type VaultName } from './paths.ts';

interface LoadedNote {
  readonly path: string;
  readonly html: string;
}

function walk(dir: string, root = dir): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const absolute = join(dir, entry.name);
    const path = relative(root, absolute).split(sep).join('/');
    if (entry.isSymbolicLink()) {
      throw new Error(`unexpected symlink ${path}`);
    }
    if (entry.isDirectory()) {
      found.push(...walk(absolute, root));
    } else if (entry.isFile()) {
      found.push(path);
    } else {
      throw new Error(`unexpected entry ${path}`);
    }
  }
  return found.sort();
}

function loadNotes(name: VaultName): LoadedNote[] {
  return walk(vaultPath(name))
    .filter((path) => path.endsWith('.html'))
    .map((path) => ({
      path,
      html: readFileSync(join(vaultPath(name), path), 'utf8'),
    }));
}

function codesOf(result: ValidationResult): string[] {
  return [...new Set(result.diagnostics.map((diagnostic) => diagnostic.code))].sort();
}

function errorCodes(result: ValidationResult): string[] {
  return [
    ...new Set(
      result.diagnostics
        .filter((diagnostic) => diagnostic.severity === 'error')
        .map((diagnostic) => diagnostic.code),
    ),
  ].sort();
}

function resultAt(byPath: ReadonlyMap<string, ValidationResult>, path: string): ValidationResult {
  const result = byPath.get(path);
  if (result === undefined) {
    throw new Error(`missing validation for ${path}`);
  }
  return result;
}

describe('fixture vaults against the note validator', () => {
  it('accepts the empty vault', () => {
    const notes = loadNotes('empty');
    expect(notes).toEqual([]);
    const vault = validateVault(notes);
    expect(vault.ok).toBe(true);
    expect(vault.files).toEqual([]);
  });

  it('accepts the backlinks vault with no errors', () => {
    const vault = validateVault(loadNotes('backlinks'));
    expect(vault.ok).toBe(true);
    const pending = vault.files.filter((file) =>
      file.result.diagnostics.some((diagnostic) => diagnostic.code === 'W_LINK_PENDING'),
    );
    expect(pending.map((file) => file.path)).toEqual(['formas-de-enlace.html']);
    for (const file of vault.files) {
      expect(errorCodes(file.result), file.path).toEqual([]);
      if (file.path === 'formas-de-enlace.html') {
        expect(codesOf(file.result)).toEqual(['W_LINK_PENDING']);
      } else {
        expect(file.result.diagnostics, file.path).toEqual([]);
      }
    }
  });

  it('fails the problems vault on the invalid task and the duplicate id', () => {
    const vault = validateVault(loadNotes('problems'));
    expect(vault.ok).toBe(false);
    const byPath = new Map(vault.files.map((file) => [file.path, file.result]));
    expect(errorCodes(resultAt(byPath, 'nota-invalida.html'))).toEqual(['E_TASK_INVALID']);
    expect(codesOf(resultAt(byPath, 'nota-invalida.html'))).toEqual(['E_TASK_INVALID']);
    expect(errorCodes(resultAt(byPath, 'dup/duplicado-alfa.html'))).toEqual(['E_ID_DUPLICATE']);
    expect(errorCodes(resultAt(byPath, 'dup/duplicado-beta.html'))).toEqual(['E_ID_DUPLICATE']);
    expect(codesOf(resultAt(byPath, 'nota-pendiente.html'))).toEqual(['W_LINK_PENDING']);
    expect(resultAt(byPath, 'nota-pendiente.html').ok).toBe(true);
    for (const path of [
      'nota-sana.html',
      'nota-destino.html',
      'nota-rota.html',
      'nota-huerfana.html',
      'href-desfasado.html',
      'anidada/ruta-del-tema.html',
    ]) {
      const result = resultAt(byPath, path);
      expect(result.diagnostics, path).toEqual([]);
      expect(result.ok, path).toBe(true);
    }
  });

  it('reports the catalog codes for every malicious note', () => {
    const notes = loadNotes('malicious');
    expect(notes.map((note) => note.path).sort()).toEqual(
      MALICIOUS.map((spec) => spec.path).sort(),
    );
    for (const spec of MALICIOUS) {
      const note = notes.find((candidate) => candidate.path === spec.path);
      expect(note, spec.path).toBeDefined();
      if (note === undefined) {
        continue;
      }
      const result = validateNote(note.html, { notePath: spec.path });
      expect(codesOf(result), spec.path).toEqual([...spec.codes].sort());
      const hasError = result.diagnostics.some((diagnostic) => diagnostic.severity === 'error');
      expect(result.ok, spec.path).toBe(!hasError);
    }
    const vault = validateVault(notes);
    expect(vault.ok).toBe(false);
  });

  it('accepts the seeded generator output with no diagnostics', () => {
    const notes = generateVault({ noteCount: 1000, seed: NFR_SEED })
      .filter((file) => file.path.endsWith('.html'))
      .map((file) => ({ path: file.path, html: file.contents }));
    expect(notes).toHaveLength(1000);
    const vault = validateVault(notes);
    expect(vault.ok).toBe(true);
    const noisy = vault.files.filter((file) => file.result.diagnostics.length > 0);
    expect(noisy.map((file) => file.path)).toEqual([]);
  });
});
