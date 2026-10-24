import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { commands } from '../packages/cli/src/registry.ts';
import { expect, it } from 'vitest';

const root = join(import.meta.dirname, '..');
const bin = join(root, 'packages/cli/bin/gaveta.js');

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

function run(args: readonly string[], options: { cwd?: string; input?: string } = {}): RunResult {
  const result = spawnSync(process.execPath, [bin, ...args], {
    cwd: options.cwd ?? root,
    env: childEnv(),
    encoding: 'utf8',
    input: options.input,
  });
  return {
    stdout: result.stdout,
    stderr: result.stderr,
    status: result.status ?? 1,
  };
}

/** Split a `gaveta …` example into argv tokens (without the leading `gaveta`). */
function tokensFromExample(example: string): string[] {
  const trimmed = example.startsWith('gaveta ') ? example.slice('gaveta '.length) : example;
  const tokens: string[] = [];
  let current = '';
  let quote: '"' | "'" | null = null;
  for (const char of trimmed) {
    if (quote !== null) {
      if (char === quote) {
        quote = null;
        tokens.push(current);
        current = '';
      } else {
        current += char;
      }
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === ' ') {
      if (current.length > 0) {
        tokens.push(current);
        current = '';
      }
      continue;
    }
    current += char;
  }
  if (current.length > 0) {
    tokens.push(current);
  }
  return tokens;
}

function runExample(
  example: string,
  options: { cwd?: string; input?: string; vault?: string } = {},
) {
  const args = [...tokensFromExample(example)];
  if (options.vault !== undefined) {
    args.push('--vault', options.vault);
  }
  return run(args, { cwd: options.cwd, input: options.input });
}

const DOC_BODY =
  '<article><h1>Usar SQLite</h1><section id="resumen"><p>Nota de prueba para la guía.</p></section></article>';

it('prints the guide without stderr noise', () => {
  const full = run(['guide']);
  expect(full.status).toBe(0);
  expect(full.stderr).toBe('');
  expect(full.stdout).toContain('Guía de autoría de Gaveta');

  const json = run(['guide', '--topic', 'errores', '--json']);
  expect(json.status).toBe(0);
  expect(json.stderr).toBe('');
  const body = JSON.parse(json.stdout) as { ok: boolean; data: { diagnostics: unknown[] } };
  expect(body.ok).toBe(true);
  expect(body.data.diagnostics.length).toBeGreaterThan(0);
});

it('runs registry command examples against a prepared vault', () => {
  const parent = mkdtempSync(join(tmpdir(), 'gaveta-guide-e2e-'));
  const vault = join(parent, 'vault');
  try {
    const init = run(['init', vault, '--json']);
    expect(init.status).toBe(0);
    expect(init.stderr).toBe('');

    const create = runExample('gaveta new "Usar SQLite" --type doc --from - --json', {
      vault,
      input: DOC_BODY,
    });
    expect(create.status).toBe(0);
    expect(create.stderr).toBe('');

    const destBody =
      '<article><h1>destino</h1><section id="cuerpo"><p>Destino del enlace.</p></section></article>';
    const dest = runExample('gaveta new destino --type doc --from - --json', {
      vault,
      input: destBody,
    });
    expect(dest.status).toBe(0);

    const origenBody =
      '<article><h1>origen</h1><section id="cuerpo"><p>Enlace a destino.</p></section></article>';
    const origen = runExample('gaveta new origen --type doc --from - --json', {
      vault,
      input: origenBody,
    });
    expect(origen.status).toBe(0);

    const skip = new Set([
      'init',
      'new',
      'edit',
      'adopt',
      'mv',
      'rm',
      'guide',
      'skill',
      'todo',
      'validate',
      'link',
      'update',
      'serve',
      'mkdir',
      'mv-folder',
      'rm-folder',
      'meta',
    ]);
    for (const command of commands) {
      if (skip.has(command.name)) {
        continue;
      }
      const result = runExample(command.example, { vault });
      expect(result.stderr, command.example).toBe('');
      expect(result.status, command.example).toBe(0);
    }

    const validate = run(['validate', '--json'], { cwd: vault });
    expect(validate.status).toBe(0);
    expect(validate.stderr).toBe('');

    const todoList = runExample('gaveta todo list --open --json', { vault });
    expect(todoList.status).toBe(0);
    expect(todoList.stderr).toBe('');

    const read = runExample('gaveta read "Usar SQLite" --as outline', { vault });
    expect(read.status).toBe(0);
    expect(read.stderr).toBe('');

    const edit = runExample(
      'gaveta edit "Usar SQLite" --section resumen --append --from - --json',
      { vault, input: '<p>Más contexto.</p>' },
    );
    expect(edit.status).toBe(0);
    expect(edit.stderr).toBe('');

    const link = runExample('gaveta link origen destino --rel related --json', { vault });
    expect(link.status).toBe(0);

    const disposable = runExample('gaveta new "Nota huérfana" --type doc --from - --json', {
      vault,
      input:
        '<article><h1>Nota huérfana</h1><section id="cuerpo"><p>Sin backlinks.</p></section></article>',
    });
    expect(disposable.status).toBe(0);

    const move = runExample('gaveta mv "Nota huérfana" archivada/ --json', { vault });
    expect(move.status).toBe(0);

    const remove = runExample('gaveta rm archivada/nota-huerfana.html --json', { vault });
    expect(remove.status).toBe(0);
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});
