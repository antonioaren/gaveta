import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';

const root = join(import.meta.dirname, '..');
const bin = join(root, 'packages/cli/bin/gaveta.js');
const SANA = readFileSync(join(root, 'fixtures/vaults/problems/nota-sana.html'), 'utf8');

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

function run(args: readonly string[], cwd: string, input?: string): RunResult {
  const result = spawnSync(process.execPath, [bin, ...args], {
    cwd,
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

function stable(stdout: string): string {
  return `${JSON.stringify(redact(JSON.parse(stdout)), null, 2)}\n`;
}

function redact(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => redact(entry));
  }
  if (typeof value !== 'object' || value === null) {
    return value;
  }
  const next: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if ((key === 'id' || key === 'targetId') && typeof entry === 'string') {
      next[key] = '<id>';
      continue;
    }
    if (key === 'hash' && typeof entry === 'string') {
      next[key] = '<hash>';
      continue;
    }
    next[key] = redact(entry);
  }
  return next;
}

it('creates notes with escaped angle brackets in inline code', () => {
  const parent = mkdtempSync(join(tmpdir(), 'gaveta-e2e-esc-'));
  try {
    const vault = makeVault(parent);
    const html = '<article><h1>Esc</h1><p><code>a/&lt;n&gt;/b</code> y 1 &lt; 2</p></article>';
    const created = run(['new', 'Esc', '--type', 'doc', '--from', '-', '--json'], vault, html);
    expect(created.status).toBe(0);
    expect(created.stderr).toBe('');
    const body = JSON.parse(created.stdout) as { ok: boolean; data: { path: string } };
    expect(body.ok).toBe(true);
    expect(body.data.path).toBe('esc.html');
    const validated = run(['validate', 'esc.html', '--json'], vault);
    expect(validated.status).toBe(0);
    expect(validated.stderr).toBe('');
    const onDisk = readFileSync(join(vault, 'esc.html'), 'utf8');
    expect(onDisk).toContain('<code>a/&lt;n&gt;/b</code>');
    expect(onDisk.toLowerCase().indexOf('<n>')).toBe(-1);
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

it('creates, reads, edits, and searches from the binary', () => {
  const parent = mkdtempSync(join(tmpdir(), 'gaveta-e2e-notes-'));
  try {
    const vault = makeVault(parent);
    const other = run(
      ['new', 'Other', '--type', 'doc', '--from', '-'],
      vault,
      '<article><h1>Other</h1><p>El motor usa sqlite.</p></article>',
    );
    expect(other.status).toBe(0);
    expect(other.stderr).toBe('');
    expect(other.stdout).toContain('Creada other.html\n');
    expect(other.stdout).toContain('sha256:');

    const origin = run(
      ['new', 'Origen', '--type', 'doc', '--in', 'notas', '--from', '-', '--json'],
      vault,
      '<article><h1>Origen</h1><section id="cuerpo"><p>Ver [[Other]]</p></section></article>',
    );
    expect(origin.status).toBe(0);
    expect(origin.stderr).toBe('');
    expect(stable(origin.stdout)).toMatchSnapshot();
    const created = JSON.parse(origin.stdout) as {
      data: { path: string; links: { resolved: { href: string | null }[] } };
    };
    expect(created.data.path).toBe('notas/origen.html');
    expect(created.data.links.resolved.some((link) => link.href === '../other.html')).toBe(true);

    const read = run(['read', 'Origen', '--as', 'text'], vault);
    expect(read.status).toBe(0);
    expect(read.stdout).toContain('Other');
    expect(read.stdout).toContain('sha256:');
    expect(read.stderr).toBe('');

    const edited = run(
      ['edit', 'Origen', '--section', 'cuerpo', '--append', '--from', '-'],
      vault,
      '<p>Añadido.</p>',
    );
    expect(edited.status).toBe(0);
    expect(edited.stdout).toContain('Actualizada notas/origen.html\n');
    expect(edited.stderr).toBe('');

    const found = run(['search', 'sqlite', '--json'], vault);
    expect(found.status).toBe(0);
    expect(found.stderr).toBe('');
    const hits = JSON.parse(found.stdout) as { data: { hits: { path: string }[] } };
    expect(hits.data.hits.some((hit) => hit.path === 'other.html')).toBe(true);

    const help = run(['new', '--help'], vault);
    expect(help.status).toBe(0);
    expect(help.stdout).toContain('gaveta new "Usar SQLite" --type doc --in decisiones --from -');
    expect(run(['read', '--help'], vault).stdout).toContain(
      'gaveta read "Usar SQLite" --as outline',
    );
    expect(run(['edit', '--help'], vault).stdout).toContain(
      'gaveta edit "Usar SQLite" --section resumen --replace --from -',
    );
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

it('snapshots read --as outline for a stable fixture note', () => {
  const parent = mkdtempSync(join(tmpdir(), 'gaveta-e2e-notes-read-'));
  try {
    const vault = makeVault(parent);
    writeFileSync(join(vault, 'nota-sana.html'), SANA);
    const result = run(['read', 'Nota sana', '--as', 'outline', '--json'], vault);
    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toMatchSnapshot();
    const body = JSON.parse(result.stdout) as {
      data: { hash: string; outline: { sections: { id: string }[]; links: { text: string }[] } };
    };
    expect(body.data.hash.startsWith('sha256:')).toBe(true);
    expect(body.data.outline.sections.some((section) => section.id === 'resumen')).toBe(true);
    expect(body.data.outline.links.some((link) => link.text === 'Nota destino')).toBe(true);
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

it('snapshots a conflict and does not overwrite the note', () => {
  const parent = mkdtempSync(join(tmpdir(), 'gaveta-e2e-notes-conflict-'));
  try {
    const vault = makeVault(parent);
    const created = run(
      ['new', 'Nota', '--type', 'doc', '--from', '-', '--json'],
      vault,
      '<article><h1>Nota</h1><section id="cuerpo"><p>uno</p></section></article>',
    );
    expect(created.status).toBe(0);
    const hash = (JSON.parse(created.stdout) as { data: { hash: string } }).data.hash;
    const file = join(vault, 'nota.html');
    const modified = readFileSync(file, 'utf8').replace('uno', 'dos');
    writeFileSync(file, modified);
    const conflict = run(
      [
        'edit',
        'Nota',
        '--section',
        'cuerpo',
        '--replace',
        '--if-match',
        hash,
        '--from',
        '-',
        '--json',
      ],
      vault,
      '<p>tres</p>',
    );
    expect(conflict.status).toBe(3);
    expect(conflict.stderr).toBe('');
    expect(conflict.stdout).toMatchSnapshot();
    expect(readFileSync(file, 'utf8')).toBe(modified);
    expect(readFileSync(file, 'utf8').includes('tres')).toBe(false);
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});
