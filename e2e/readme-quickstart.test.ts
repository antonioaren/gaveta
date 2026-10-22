import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';

const root = join(import.meta.dirname, '..');
const vaultDir = join(root, 'mi-vault');

interface RunResult {
  stdout: string;
  stderr: string;
  status: number;
}

function childEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  delete env.GAVETA_VAULT;
  return env;
}

/** Mirrors README.md § Probar el MVP (`pnpm exec` from the repo root; `open` is macOS-only). */
function quickstart(args: readonly string[], input?: string): RunResult {
  const result = spawnSync('pnpm', ['exec', 'gaveta', ...args], {
    cwd: root,
    env: childEnv(),
    encoding: 'utf8',
    input,
  });
  return {
    stdout: result.stdout,
    stderr: result.stderr,
    status: result.status ?? 1,
  };
}

it('runs the README Probar el MVP quickstart without stderr noise', () => {
  rmSync(vaultDir, { recursive: true, force: true });
  try {
    const init = quickstart(['init', 'mi-vault', '--json']);
    expect(init.status).toBe(0);
    expect(init.stderr).toBe('');

    const otherBody =
      '<article><h1>Other</h1><section id="cuerpo"><p>Nota de referencia.</p></section></article>';
    const other = quickstart(
      ['new', 'Other', '--type', 'doc', '--vault', 'mi-vault', '--from', '-', '--json'],
      otherBody,
    );
    expect(other.status).toBe(0);
    expect(other.stderr).toBe('');

    const origenBody =
      '<article><h1>Origen</h1><section id="cuerpo"><p>Ver [[Other]]</p></section></article>';
    const origen = quickstart(
      ['new', 'Origen', '--type', 'doc', '--vault', 'mi-vault', '--from', '-', '--json'],
      origenBody,
    );
    expect(origen.status).toBe(0);
    expect(origen.stderr).toBe('');

    const read = quickstart(['read', 'Origen', '--as', 'outline', '--vault', 'mi-vault', '--json']);
    expect(read.status).toBe(0);
    expect(read.stderr).toBe('');
    const outline = JSON.parse(read.stdout) as {
      data: { as: string; outline: { sections: { id: string }[] } };
    };
    expect(outline.data.as).toBe('outline');
    expect(outline.data.outline.sections.some((section) => section.id === 'cuerpo')).toBe(true);

    const edit = quickstart(
      [
        'edit',
        'Origen',
        '--vault',
        'mi-vault',
        '--section',
        'cuerpo',
        '--append',
        '--from',
        '-',
        '--json',
      ],
      '<p>Más texto.</p>',
    );
    expect(edit.status).toBe(0);
    expect(edit.stderr).toBe('');
    expect(readFileSync(join(vaultDir, 'origen.html'), 'utf8')).toContain('Más texto.');

    const search = quickstart(['search', 'Other', '--vault', 'mi-vault', '--json']);
    expect(search.status).toBe(0);
    expect(search.stderr).toBe('');
    const hits = JSON.parse(search.stdout) as { data: { hits: { title: string }[] } };
    expect(hits.data.hits.some((hit) => hit.title === 'Other')).toBe(true);

    expect(existsSync(join(vaultDir, 'other.html'))).toBe(true);
    expect(existsSync(join(vaultDir, 'origen.html'))).toBe(true);
  } finally {
    rmSync(vaultDir, { recursive: true, force: true });
  }
});
