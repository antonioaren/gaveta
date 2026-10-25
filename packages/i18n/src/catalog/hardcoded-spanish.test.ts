import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = join(import.meta.dirname, '..', '..', '..', '..');

const SCAN_ROOTS = [
  join(REPO_ROOT, 'packages/cli/src'),
  join(REPO_ROOT, 'packages/server/src'),
  join(REPO_ROOT, 'apps/web/src'),
] as const;

const SPANISH_CHAR = /[áéíóúñÁÉÍÓÚ¿¡]/;

/** Unaccented Spanish phrases that must not appear as UI literals in source. */
const SPANISH_PHRASE =
  /\b(Creada|Actualizada|Añadida|Enlazada|Sin cambios|Sin hallazgos|Reparado|Movida|Borrada|Metadatos actualizados|Carpeta creada|Nota adoptada|No hay tareas|Indica un vault|Todo válido|Exportación completada|Importación completada|Vista previa de|Esta instalación no admite|Demasiadas conexiones|Autenticación requerida|Mensaje demasiado grande|Solo se admite el mensaje)\b/;

const STRING_LITERAL = /(['"`])(?:(?!\1).)*\1/g;

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      out.push(...walk(path));
      continue;
    }
    if (!path.endsWith('.ts') && !path.endsWith('.tsx')) {
      continue;
    }
    if (path.includes('.test.') || path.includes('__snapshots__')) {
      continue;
    }
    if (path.includes('/i18n/')) {
      continue;
    }
    out.push(path);
  }
  return out;
}

function lineHasUserFacingSpanish(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed.startsWith('//') || trimmed.startsWith('*')) {
    return false;
  }
  if (trimmed.includes('cli.auto.') || trimmed.includes('cli.human.') || trimmed.includes('web.')) {
    return false;
  }
  if (trimmed.includes('server.ws.')) {
    return false;
  }
  if (!STRING_LITERAL.test(line)) {
    return false;
  }
  if (SPANISH_CHAR.test(line)) {
    return true;
  }
  for (const match of line.matchAll(STRING_LITERAL)) {
    const literal = match[0];
    if (SPANISH_PHRASE.test(literal)) {
      return true;
    }
  }
  return false;
}

describe('hardcoded Spanish UI literals', () => {
  it('are not present outside message catalogs', () => {
    const violations: string[] = [];
    for (const root of SCAN_ROOTS) {
      for (const file of walk(root)) {
        const lines = readFileSync(file, 'utf8').split('\n');
        lines.forEach((line, index) => {
          if (lineHasUserFacingSpanish(line)) {
            violations.push(`${file}:${String(index + 1)}: ${line.trim()}`);
          }
        });
      }
    }
    expect(violations).toEqual([]);
  });
});
