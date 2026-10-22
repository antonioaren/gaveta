import './warning.ts';
import { DatabaseSync } from 'node:sqlite';
import { chmod, cp, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { expect, it } from 'vitest';
import {
  BACKLINK_COUNT,
  DUPLICATE_ID,
  NFR_SEED,
  NFR_SQLITE_NOTE_INDEX,
  NOTE_X,
  generateVault,
  generatedNotePath,
  noteUlid,
  vaultPath,
  writeVault,
  type VaultName,
} from '@gaveta/fixtures';
import {
  GavetaError,
  INDEX_RELATIVE_PATH,
  INDEX_SCHEMA_VERSION,
  SEARCH_SNIPPET_START,
  foldMatchKey,
  formatDiagnostic,
  openVaultIndex,
  type SearchOptions,
  type VaultIndex,
} from '../index.ts';
import { migrateDatabase, readSchemaVersion } from './schema.ts';

const NOTE_A = '01JB7Z3K9QX4T5M2N8V6R0WYHC';
const NOTE_B = '01JB8A2M4R7C9D1E3F5G7H9J0K';
const NOTE_C = '01JB9C3N5S8D0E2F4G6H8J1K2M';

function noteHtml(options: {
  readonly title: string;
  readonly id?: string | null;
  readonly body: string;
  readonly aliases?: string;
  readonly tags?: string;
  readonly type?: string;
  readonly extra?: string;
}): string {
  const id = options.id === undefined ? NOTE_A : options.id;
  const head = ['<meta charset="utf-8">', `<title>${options.title}</title>`];
  if (id !== null) {
    head.push(`<meta name="gaveta:id" content="${id}">`);
  }
  head.push(`<meta name="gaveta:type" content="${options.type ?? 'doc'}">`);
  head.push('<meta name="gaveta:created" content="2026-10-22T10:00:00Z">');
  if (options.tags !== undefined) {
    head.push(`<meta name="gaveta:tags" content="${options.tags}">`);
  }
  if (options.aliases !== undefined) {
    head.push(`<meta name="gaveta:aliases" content="${options.aliases}">`);
  }
  return `<!doctype html><html lang="es"><head>${head.join('')}</head><body><article><h1>${options.title}</h1>${options.extra ?? ''}<p>${options.body}</p></article></body></html>`;
}

async function withTemp(run: (directory: string) => Promise<void>): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), 'gaveta-index-'));
  try {
    await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function makeVault(parent: string): Promise<string> {
  const root = join(parent, 'vault');
  await mkdir(join(root, '.gaveta'), { recursive: true });
  return root;
}

async function writeNote(root: string, relativePath: string, html: string): Promise<void> {
  const absolute = join(root, ...relativePath.split('/'));
  await mkdir(dirname(absolute), { recursive: true });
  await writeFile(absolute, html);
}

async function copyVault(parent: string, name: VaultName): Promise<string> {
  const root = join(parent, name);
  await cp(vaultPath(name), root, { recursive: true });
  return root;
}

async function withIndex(root: string, run: (index: VaultIndex) => Promise<void>): Promise<void> {
  const index = await openVaultIndex(root);
  try {
    await run(index);
  } finally {
    index.close();
  }
}

async function captureStreams(
  run: () => Promise<void>,
): Promise<{ stdout: string; stderr: string }> {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const originalOut = process.stdout.write.bind(process.stdout);
  const originalErr = process.stderr.write.bind(process.stderr);
  process.stdout.write = (chunk: string | Uint8Array) => {
    stdout.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8'));
    return true;
  };
  process.stderr.write = (chunk: string | Uint8Array) => {
    stderr.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8'));
    return true;
  };
  try {
    await run();
    await new Promise((resolve) => {
      setImmediate(resolve);
    });
  } finally {
    process.stdout.write = originalOut;
    process.stderr.write = originalErr;
  }
  return { stdout: stdout.join(''), stderr: stderr.join('') };
}

it('folds titles without case or accents', () => {
  expect(foldMatchKey('Índice SQLite')).toBe('indice sqlite');
  expect(foldMatchKey('Ñandú')).toBe('nandu');
});

it('creates a missing index inside .gaveta and stays quiet on stdout and stderr', async () => {
  await withTemp(async (parent) => {
    const root = await makeVault(parent);
    await mkdir(join(root, 'notes'));
    const streams = await captureStreams(async () => {
      const index = await openVaultIndex(join(root, 'notes', '..'));
      try {
        expect(index.schemaVersion).toBe(INDEX_SCHEMA_VERSION);
        expect(index.recovery()).toBeNull();
        expect(index.location).toBe(join(await realpath(root), '.gaveta', 'index.sqlite'));
        expect(index.location.endsWith(INDEX_RELATIVE_PATH)).toBe(true);
        expect(await index.rebuild()).toMatchObject({ written: 0, removed: 0, problems: [] });
      } finally {
        index.close();
      }
    });
    expect(streams.stdout).not.toContain('ExperimentalWarning');
    expect(streams.stderr).not.toContain('ExperimentalWarning');
    expect(streams.stdout).not.toContain('SQLite is an experimental feature');
    expect(streams.stderr).not.toContain('SQLite is an experimental feature');
  });
});

it('indexes notes, sections, links, tasks, and FTS from a vault', async () => {
  await withTemp(async (parent) => {
    const root = await makeVault(parent);
    await writeNote(
      root,
      'notas/indice.html',
      noteHtml({
        title: 'Índice',
        id: NOTE_A,
        aliases: 'Tabla, Índice maestro',
        tags: 'guia, sqlite',
        body: 'El cuerpo menciona sqlite.',
        extra: `<section id="cuerpo"><h2>Cuerpo</h2><p>Texto</p><section id="anidada"><h3>Anidada</h3><p>Dentro</p></section></section>
          <p><a href="otra.html" data-g-to="${NOTE_B}" rel="related">Otra</a></p>
          <p><a data-g-pending="Nota fantasma">Nota fantasma</a></p>
          <p>Ver [[Otra nota#parte|texto]]</p>
          <ul class="tasks"><li data-g-task id="hacer" data-g-due="2026-10-23" data-g-priority="high"><input type="checkbox" checked>Hacer</li></ul>`,
      }),
    );
    await withIndex(root, async (index) => {
      const report = await index.rebuild();
      expect(report.written).toBe(1);
      expect(report.duplicates).toEqual([]);
      const note = index.note('notas/indice.html');
      expect(note?.titleFolded).toBe('indice');
      expect(note?.aliases).toEqual(['Tabla', 'Índice maestro']);
      expect(note?.tags).toEqual(['guia', 'sqlite']);
      expect(note?.contentHash.startsWith('sha256:')).toBe(true);
      expect(index.sections('notas/indice.html').map((section) => section.sectionId)).toEqual([
        'cuerpo',
        'anidada',
      ]);
      expect(index.sections('notas/indice.html')[1]?.parentOrdinal).toBe(0);
      const links = index.links('notas/indice.html');
      expect(links.map((link) => link.kind)).toEqual(['canonical', 'pending', 'wikilink']);
      expect(links[1]).toMatchObject({ ghost: true, pendingTitle: 'Nota fantasma' });
      expect(links[2]).toMatchObject({
        wikilinkTitle: 'Otra nota',
        wikilinkSection: 'parte',
        wikilinkLabel: 'texto',
      });
      expect(index.tasks('notas/indice.html')[0]).toMatchObject({
        taskId: 'hacer',
        checked: true,
        due: '2026-10-23',
        priority: 'high',
      });
      const hit = index.search('indice')[0];
      expect(hit?.path).toBe('notas/indice.html');
      expect(hit?.snippet).toContain(SEARCH_SNIPPET_START);
      expect(index.search('sqlite', { type: 'doc', tag: 'sqlite', limit: 5 })[0]?.path).toBe(
        'notas/indice.html',
      );
      expect(index.search('sqlite', { type: 'slides' })).toEqual([]);
      const again = await index.rebuild();
      expect(again.written).toBe(1);
      expect(index.note('notas/indice.html')?.contentHash).toBe(note?.contentHash);
    });
  });
});

it('syncs incrementally without rewriting unchanged notes', async () => {
  await withTemp(async (parent) => {
    const root = await makeVault(parent);
    await writeNote(root, 'a.html', noteHtml({ title: 'Alfa', id: NOTE_A, body: 'alfa sqlite' }));
    await writeNote(
      root,
      'b.html',
      noteHtml({ title: 'Beta', id: NOTE_B, body: 'beta', extra: '' }),
    );
    await withIndex(root, async (index) => {
      await index.rebuild();
      const betaHash = index.note('b.html')?.contentHash;
      await writeNote(
        root,
        'a.html',
        noteHtml({ title: 'Alfa nueva', id: NOTE_A, body: 'alfa sqlite editada' }),
      );
      const updated = await index.sync();
      expect(updated.written).toBe(1);
      expect(updated.removed).toBe(0);
      expect(index.note('a.html')?.title).toBe('Alfa nueva');
      expect(index.note('b.html')?.contentHash).toBe(betaHash);
      const noop = await index.sync();
      expect(noop.written).toBe(0);
      expect(noop.removed).toBe(0);
      await rm(join(root, 'b.html'));
      const removed = await index.sync();
      expect(removed.removed).toBe(1);
      expect(index.note('b.html')).toBeNull();
    });
  });
});

it('updates and removes one note without rewriting the others', async () => {
  await withTemp(async (parent) => {
    const root = await makeVault(parent);
    await writeNote(root, 'a.html', noteHtml({ title: 'Alfa', id: NOTE_A, body: 'alfa sqlite' }));
    await writeNote(
      root,
      'b.html',
      noteHtml({ title: 'Beta', id: NOTE_B, body: 'beta', extra: '' }),
    );
    await withIndex(root, async (index) => {
      await index.rebuild();
      const betaHash = index.note('b.html')?.contentHash;
      await writeNote(
        root,
        'a.html',
        noteHtml({ title: 'Alfa nueva', id: NOTE_A, body: 'alfa sqlite editada' }),
      );
      const updated = await index.upsert('a.html');
      expect(updated.written).toBe(1);
      expect(index.note('a.html')?.title).toBe('Alfa nueva');
      expect(index.search('editada')[0]?.path).toBe('a.html');
      expect(index.note('b.html')?.contentHash).toBe(betaHash);
      const removed = await index.remove('a.html');
      expect(removed.removed).toBe(1);
      expect(index.note('a.html')).toBeNull();
      expect(index.search('sqlite')).toEqual([]);
      expect(index.note('b.html')?.title).toBe('Beta');
      expect((await index.remove('a.html')).removed).toBe(0);
      await expect(index.upsert('ausente.html')).rejects.toMatchObject({ code: 'E_REF_NOT_FOUND' });
    });
  });
});

it('rebuilds from scratch after a note disappears from disk', async () => {
  await withTemp(async (parent) => {
    const root = await makeVault(parent);
    await writeNote(root, 'a.html', noteHtml({ title: 'Alfa', id: NOTE_A, body: 'alfa' }));
    await writeNote(root, 'b.html', noteHtml({ title: 'Beta', id: NOTE_B, body: 'beta' }));
    await withIndex(root, async (index) => {
      await index.rebuild();
      await rm(join(root, 'b.html'));
      const report = await index.rebuild();
      expect(report.written).toBe(1);
      expect(index.notes().map((note) => note.path)).toEqual(['a.html']);
    });
  });
});

it('keeps a healthy cache across open and migrates version 1 in place', async () => {
  await withTemp(async (parent) => {
    const root = await makeVault(parent);
    await writeNote(
      root,
      'a.html',
      noteHtml({ title: 'Alfa', id: NOTE_A, body: 'alfa', tags: 'nfr' }),
    );
    const first = await openVaultIndex(root);
    await first.rebuild();
    const hash = first.note('a.html')?.contentHash;
    first.close();

    const reopened = await openVaultIndex(root);
    expect(reopened.recovery()).toBeNull();
    expect(reopened.note('a.html')?.contentHash).toBe(hash);
    reopened.close();

    const file = join(root, '.gaveta', 'index.sqlite');
    await rm(file, { force: true });
    await rm(`${file}-wal`, { force: true });
    await rm(`${file}-shm`, { force: true });
    const legacy = new DatabaseSync(file);
    migrateDatabase(legacy, 1);
    legacy
      .prepare(
        `INSERT INTO notes (
          path, id, title, type, created, updated, tags, plain_text, content_hash, mtime_ms, size_bytes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        'a.html',
        NOTE_A,
        'Título raro',
        'doc',
        '2026-10-22T10:00:00Z',
        null,
        '[]',
        'menciona sqlite',
        'sha256:abc',
        0,
        12,
      );
    legacy.prepare('INSERT INTO aliases (path, alias) VALUES (?, ?)').run('a.html', 'Apodo');
    legacy
      .prepare(
        `INSERT INTO sections (
          path, ordinal, section_id, heading, level, plain_text, parent_ordinal
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run('a.html', 0, 'cuerpo', 'Cuerpo', 2, 'menciona sqlite', null);
    expect(readSchemaVersion(legacy)).toBe(1);
    legacy.close();

    const migrated = await openVaultIndex(root);
    try {
      expect(migrated.recovery()).toBeNull();
      expect(migrated.schemaVersion).toBe(2);
      expect(migrated.note('a.html')).toMatchObject({
        title: 'Título raro',
        titleFolded: 'titulo raro',
      });
      expect(migrated.aliases('a.html')[0]?.aliasFolded).toBe('apodo');
      expect(migrated.search('sqlite')[0]?.path).toBe('a.html');
      expect(migrated.search('titulo')[0]?.path).toBe('a.html');
      expect(migrated.search('apodo')[0]?.path).toBe('a.html');
    } finally {
      migrated.close();
    }
  });
});

it('replaces a corrupt or future-schema cache and still indexes the files', async () => {
  await withTemp(async (parent) => {
    const root = await makeVault(parent);
    const html = noteHtml({ title: 'Alfa', id: NOTE_A, body: 'alfa sqlite' });
    await writeNote(root, 'a.html', html);
    const notePath = join(root, 'a.html');
    const before = await readFile(notePath);
    await writeFile(join(root, '.gaveta', 'index.sqlite'), 'this is not sqlite');
    const corrupt = await openVaultIndex(root);
    expect(corrupt.recovery()).toMatchObject({
      code: 'W_INDEX_RECOVERED',
      path: INDEX_RELATIVE_PATH,
      message: formatDiagnostic('W_INDEX_RECOVERED').message,
      details: { reason: 'corrupt' },
    });
    expect(corrupt.notes()).toEqual([]);
    expect((await corrupt.rebuild()).written).toBe(1);
    expect(corrupt.search('sqlite')[0]?.path).toBe('a.html');
    corrupt.close();
    expect(await readFile(notePath)).toEqual(before);

    const future = new DatabaseSync(join(root, '.gaveta', 'index.sqlite'));
    future.exec('PRAGMA user_version = 99');
    future.close();
    const replaced = await openVaultIndex(root);
    try {
      expect(replaced.recovery()?.details).toEqual({ reason: 'schema' });
      expect(replaced.schemaVersion).toBe(INDEX_SCHEMA_VERSION);
      expect(replaced.notes()).toEqual([]);
      expect((await replaced.rebuild()).written).toBe(1);
    } finally {
      replaced.close();
    }
  });
});

it('reports an unreadable note and keeps the rest of the vault searchable', async () => {
  await withTemp(async (parent) => {
    const root = await makeVault(parent);
    await writeNote(
      root,
      'sana.html',
      noteHtml({ title: 'Sana', id: NOTE_A, body: 'sqlite sano' }),
    );
    await writeNote(root, 'roto.html', 'x'.repeat(2_000_001));
    await writeNote(
      root,
      'secreto.html',
      noteHtml({ title: 'Secreto', id: NOTE_C, body: 'oculto' }),
    );
    await chmod(join(root, 'secreto.html'), 0o000);
    try {
      await withIndex(root, async (index) => {
        const report = await index.rebuild();
        expect(report.written).toBe(1);
        expect(index.search('sano')[0]?.path).toBe('sana.html');
        expect(index.note('roto.html')).toBeNull();
        expect(index.note('secreto.html')).toBeNull();
        expect(report.problems.map((problem) => problem.path).sort()).toEqual([
          'roto.html',
          'secreto.html',
        ]);
        expect(report.problems.find((problem) => problem.path === 'roto.html')?.code).toBe(
          'E_HTML_INVALID',
        );
      });
    } finally {
      await chmod(join(root, 'secreto.html'), 0o600);
    }
  });
});

it('reports duplicate ids and still returns both notes', async () => {
  await withTemp(async (parent) => {
    const root = await copyVault(parent, 'problems');
    await withIndex(root, async (index) => {
      const report = await index.rebuild();
      expect(index.duplicates()).toEqual([
        {
          id: DUPLICATE_ID,
          paths: ['dup/duplicado-alfa.html', 'dup/duplicado-beta.html'],
        },
      ]);
      expect(index.notesById(DUPLICATE_ID).map((note) => note.path)).toEqual([
        'dup/duplicado-alfa.html',
        'dup/duplicado-beta.html',
      ]);
      expect(
        report.problems
          .filter((problem) => problem.code === 'E_ID_DUPLICATE')
          .map((problem) => problem.path),
      ).toEqual(['dup/duplicado-alfa.html', 'dup/duplicado-beta.html']);
      expect(index.note('nota-pendiente.html')).toMatchObject({ title: 'Nota pendiente' });
      const pending = index.links('nota-pendiente.html').find((link) => link.kind === 'pending');
      expect(pending).toMatchObject({ ghost: true, pendingTitle: 'Nota fantasma' });
    });
  });
});

it('indexes the backlinks fixture, including tasks and alias search', async () => {
  await withTemp(async (parent) => {
    const root = await copyVault(parent, 'backlinks');
    await withIndex(root, async (index) => {
      const report = await index.rebuild();
      expect(report.written).toBe(3 + BACKLINK_COUNT);
      const incoming = index.links().filter((link) => link.targetId === NOTE_X.id);
      expect(incoming).toHaveLength(BACKLINK_COUNT);
      expect(index.search('equis')[0]?.path).toBe(NOTE_X.path);
      expect(index.aliases(NOTE_X.path).map((alias) => alias.alias)).toEqual(['Nota equis']);
      expect(index.tasks('enlaces/mas/enlace-20.html').map((task) => task.taskId)).toEqual([
        'revisar',
        'hecho',
      ]);
      expect(index.tasks('enlaces/mas/enlace-20.html')[1]?.checked).toBe(true);
    });
  });
});

it('indexes the malicious fixture without leaving the vault', async () => {
  await withTemp(async (parent) => {
    const root = await copyVault(parent, 'malicious');
    await withIndex(root, async (index) => {
      const report = await index.rebuild();
      expect(report.written).toBeGreaterThan(0);
      expect(
        report.problems.some(
          (problem) => problem.path === 'script.html' && problem.code === 'E_UNSAFE_SCRIPT',
        ),
      ).toBe(true);
      expect(index.location).toBe(join(await realpath(root), '.gaveta', 'index.sqlite'));
    });
    expect(await readFile(join(root, 'path-traversal.html'), 'utf8')).toContain('fuera.html');
  });
});

it('rejects a closed index, a missing vault, bad search arguments, and a damaged row', async () => {
  await withTemp(async (parent) => {
    await expect(openVaultIndex(join(parent, 'missing'))).rejects.toMatchObject({
      code: 'E_VAULT_NOT_FOUND',
    });
    await expect(openVaultIndex(1 as never)).rejects.toMatchObject({ code: 'E_ARG_INVALID' });
    const root = await makeVault(parent);
    await writeNote(root, 'a.html', noteHtml({ title: 'Alfa', id: NOTE_A, body: 'sqlite' }));
    const index = await openVaultIndex(root);
    await index.rebuild();
    expect(() => index.search('   ')).toThrow(GavetaError);
    expect(() => index.search('sqlite', { limit: 0 })).toThrow(GavetaError);
    expect(() => index.search('sqlite', { limit: 101 })).toThrow(GavetaError);
    expect(() => index.search('sqlite', { tag: ' ' })).toThrow(GavetaError);
    const badType: SearchOptions = { type: 'page' as 'doc' };
    expect(() => index.search('sqlite', badType)).toThrow(GavetaError);
    expect(() => index.search('sqlite OR "')).toThrow(GavetaError);
    expect(index.notes()).toHaveLength(1);
    expect(() => index.notesById('')).toThrow(GavetaError);
    index.close();
    expect(() => index.notes()).toThrow(/closed/);
    index.close();

    const database = new DatabaseSync(join(root, '.gaveta', 'index.sqlite'));
    database.prepare('UPDATE notes SET tags = ? WHERE path = ?').run('{', 'a.html');
    database.close();
    const damaged = await openVaultIndex(root);
    try {
      let thrown: unknown;
      try {
        damaged.notes();
      } catch (error) {
        thrown = error;
      }
      expect(thrown).toBeInstanceOf(GavetaError);
      expect(thrown).toMatchObject({ code: 'E_INDEX_CORRUPT' });
    } finally {
      damaged.close();
    }
  });
});

it('reports a corrupt index when .gaveta cannot be written', async () => {
  await withTemp(async (parent) => {
    const root = await makeVault(parent);
    await chmod(join(root, '.gaveta'), 0o500);
    try {
      await expect(openVaultIndex(root)).rejects.toMatchObject({ code: 'E_INDEX_CORRUPT' });
    } finally {
      await chmod(join(root, '.gaveta'), 0o700);
    }
  });
});

it('reindexes 5000 generated notes within the REQ-NFR-03 budget', async () => {
  await withTemp(async (parent) => {
    const root = join(parent, 'nfr');
    writeVault(root, generateVault({ noteCount: 5000, seed: NFR_SEED }));
    await withIndex(root, async (index) => {
      const started = performance.now();
      const report = await index.rebuild();
      const elapsed = performance.now() - started;
      expect(report.written).toBe(5000);
      expect(report.problems).toEqual([]);
      expect(report.duplicates).toEqual([]);
      expect(elapsed).toBeLessThan(15_000);
      const hit = index.search('sqlite', { type: 'doc', tag: 'nfr' })[0];
      expect(hit?.path).toBe(generatedNotePath(NFR_SQLITE_NOTE_INDEX));
      expect(hit?.snippet.toLowerCase()).toContain(`${SEARCH_SNIPPET_START}sqlite`);
      expect(
        index.links(generatedNotePath(NFR_SQLITE_NOTE_INDEX)).map((link) => link.targetId),
      ).toEqual([
        noteUlid(NFR_SEED, NFR_SQLITE_NOTE_INDEX + 1),
        noteUlid(NFR_SEED, NFR_SQLITE_NOTE_INDEX + 10),
      ]);
    });
  });
}, 120_000);
