import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { expect, it } from 'vitest';

const root = join(import.meta.dirname, '..');
const bin = join(root, 'packages/cli/bin/gaveta.js');
const NOTE_MOTOR = '01JB7Z3K9QX4T5M2N8V6R0WYHC';
const NOTE_OTRA = '01JB8A2M4R7C9D1E3F5G7H9J0K';
const NOTE_SLIDE = '01JB9C3N5S8D0E2F4G6H8J1K2M';

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

function run(args: readonly string[], cwd: string): RunResult {
  const result = spawnSync(process.execPath, [bin, ...args], {
    cwd,
    env: childEnv(),
    encoding: 'utf8',
  });
  return {
    stdout: result.stdout,
    stderr: result.stderr,
    status: result.status ?? 1,
  };
}

function noteHtml(options: {
  readonly title: string;
  readonly id: string;
  readonly body: string;
  readonly type?: string;
  readonly tags?: string;
  readonly extra?: string;
}): string {
  const head = [
    '<meta charset="utf-8">',
    `<title>${options.title}</title>`,
    `<meta name="gaveta:id" content="${options.id}">`,
    `<meta name="gaveta:type" content="${options.type ?? 'doc'}">`,
    '<meta name="gaveta:created" content="2026-10-22T10:00:00Z">',
  ];
  if (options.tags !== undefined) {
    head.push(`<meta name="gaveta:tags" content="${options.tags}">`);
  }
  const article =
    options.type === 'slides'
      ? (options.extra ?? '')
      : `<article><h1>${options.title}</h1><p>${options.body}</p></article>`;
  return `<!doctype html><html lang="es"><head>${head.join('')}</head><body>${article}</body></html>`;
}

function writeNote(vault: string, relativePath: string, html: string): void {
  const absolute = join(vault, ...relativePath.split('/'));
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, html);
}

function makeVault(parent: string): string {
  const vault = join(parent, 'vault');
  mkdirSync(join(vault, '.gaveta'), { recursive: true });
  writeFileSync(
    join(vault, '.gaveta', 'config.json'),
    `${JSON.stringify(
      {
        rel: {
          vocabulary: ['related', 'depends-on', 'part-of', 'supersedes', 'references'],
          strict: false,
        },
        remoteAllowlist: [],
      },
      null,
      2,
    )}\n`,
  );
  return vault;
}

it('snapshots search JSON and returns the sqlite note first', () => {
  const parent = mkdtempSync(join(tmpdir(), 'gaveta-e2e-search-'));
  try {
    const vault = makeVault(parent);
    writeNote(
      vault,
      'aaa.html',
      noteHtml({ title: 'Alfa', id: NOTE_OTRA, body: 'sin coincidencia' }),
    );
    writeNote(
      vault,
      'motor.html',
      noteHtml({
        title: 'Motor',
        id: NOTE_MOTOR,
        tags: 'indice',
        body: 'El cuerpo menciona sqlite.',
      }),
    );

    const result = run(['search', 'sqlite', '--json'], vault);
    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toMatchSnapshot();
    const body = JSON.parse(result.stdout) as {
      data: { hits: { path: string; snippet: string }[] };
    };
    expect(body.data.hits[0]?.path).toBe('motor.html');
    expect(body.data.hits[0]?.snippet).toContain('<mark>sqlite</mark>');
    expect(body.data.hits.some((hit) => hit.path === 'aaa.html')).toBe(false);

    const help = run(['search', '--help'], vault);
    expect(help.status).toBe(0);
    expect(help.stdout).toContain('gaveta search "base de datos" --json');
    expect(help.stdout).toContain('--type');
    expect(help.stdout).toContain('--tag');
    expect(help.stdout).toContain('--limit');
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

it('filters by type and tag from the binary', () => {
  const parent = mkdtempSync(join(tmpdir(), 'gaveta-e2e-search-filter-'));
  try {
    const vault = makeVault(parent);
    writeNote(
      vault,
      'motor.html',
      noteHtml({
        title: 'Motor',
        id: NOTE_MOTOR,
        tags: 'indice',
        body: 'El cuerpo menciona sqlite.',
      }),
    );
    writeNote(
      vault,
      'lamina.html',
      noteHtml({
        title: 'Lámina',
        id: NOTE_SLIDE,
        type: 'slides',
        tags: 'charla',
        body: '',
        extra: '<section class="slide"><h2>Lámina</h2><p>sqlite en la diapositiva</p></section>',
      }),
    );
    const filtered = run(
      ['search', 'sqlite', '--type', 'doc', '--tag', 'indice', '--limit', '5'],
      vault,
    );
    expect(filtered.status).toBe(0);
    expect(filtered.stdout).toContain('motor.html');
    expect(filtered.stdout).not.toContain('lamina.html');
    expect(filtered.stderr).toBe('');
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

it('treats a malicious query as text and does not drop the index', () => {
  const parent = mkdtempSync(join(tmpdir(), 'gaveta-e2e-search-sec-'));
  try {
    const vault = makeVault(parent);
    writeNote(vault, 'a.html', noteHtml({ title: 'Alfa', id: NOTE_MOTOR, body: 'visible sqlite' }));
    const payload = `'); DROP TABLE notes;--`;
    const attacked = run(['search', '--json', payload], vault);
    expect(attacked.status).toBe(0);
    expect(attacked.stderr).toBe('');
    expect(attacked.stdout).not.toContain('SQLITE');
    expect(JSON.parse(attacked.stdout)).toMatchObject({ ok: true, data: { hits: [] } });

    const still = run(['search', '--json', 'sqlite'], vault);
    expect(still.status).toBe(0);
    expect(JSON.parse(still.stdout)).toMatchObject({
      data: { hits: [{ path: 'a.html' }] },
    });
    expect(readFileSync(join(vault, 'a.html'), 'utf8')).toContain('visible sqlite');
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});
