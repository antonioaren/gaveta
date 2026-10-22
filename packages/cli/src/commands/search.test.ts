import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import {
  EXIT_CODES,
  GAVETA_DIRECTORY,
  SEARCH_DEFAULT_LIMIT,
  SEARCH_SNIPPET_END,
  SEARCH_SNIPPET_START,
  createDefaultVaultConfig,
  formatDiagnostic,
  writeVaultConfig,
} from '@gaveta/core';
import { expect, it } from 'vitest';
import { runCli, type CliIo } from '../run.ts';
import { commands } from '../registry.ts';

const NOTE_MOTOR = '01JB7Z3K9QX4T5M2N8V6R0WYHC';
const NOTE_OTRA = '01JB8A2M4R7C9D1E3F5G7H9J0K';
const NOTE_SLIDE = '01JB9C3N5S8D0E2F4G6H8J1K2M';
const NOTE_ALIAS = '01JB0D4P6T9E1F3G5H7J9K2L3N';
const NOTE_HEAD = '01JB1E5Q7U0F2G4H6J8K0L3M4P';

interface SearchHitView {
  path: string;
  id: string | null;
  title: string;
  type: string | null;
  tags: string[];
  snippet: string;
}

interface SearchData {
  query: string;
  type: string | null;
  tag: string | null;
  limit: number;
  hits: SearchHitView[];
}

interface Envelope {
  ok: boolean;
  schemaVersion: number;
  command: string;
  data: SearchData;
  warnings: { code: string; message: string; hint: string }[];
  error?: { code: string; message: string; hint: string; details?: { problem?: string } };
}

function noteHtml(options: {
  readonly title: string;
  readonly id: string;
  readonly body: string;
  readonly type?: string;
  readonly tags?: string;
  readonly aliases?: string;
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
  if (options.aliases !== undefined) {
    head.push(`<meta name="gaveta:aliases" content="${options.aliases}">`);
  }
  const article =
    options.type === 'slides' || options.type === 'todo'
      ? (options.extra ?? '')
      : `<article><h1>${options.title}</h1>${options.extra ?? ''}<p>${options.body}</p></article>`;
  return `<!doctype html><html lang="es"><head>${head.join('')}</head><body>${article}</body></html>`;
}

async function withTemp(run: (directory: string) => Promise<void>): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), 'gaveta-search-'));
  try {
    await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function makeVault(parent: string): Promise<string> {
  const root = join(parent, 'vault');
  await mkdir(join(root, GAVETA_DIRECTORY), { recursive: true });
  await writeVaultConfig(root, createDefaultVaultConfig());
  return root;
}

async function writeNote(root: string, relativePath: string, html: string): Promise<void> {
  const absolute = join(root, ...relativePath.split('/'));
  await mkdir(dirname(absolute), { recursive: true });
  await writeFile(absolute, html);
}

function capture(cwd: string): { io: CliIo; stdout: () => string; stderr: () => string } {
  let out = '';
  let err = '';
  return {
    io: {
      cwd,
      env: {},
      stdout(chunk: string) {
        out += chunk;
      },
      stderr(chunk: string) {
        err += chunk;
      },
    },
    stdout: () => out,
    stderr: () => err,
  };
}

function argv(...args: string[]): string[] {
  return ['node', 'gaveta', ...args];
}

function parseEnvelope(stdout: string): Envelope {
  return JSON.parse(stdout) as Envelope;
}

async function seedVault(root: string): Promise<void> {
  await writeNote(
    root,
    'aaa.html',
    noteHtml({ title: 'Alfa', id: NOTE_OTRA, body: 'sin coincidencia' }),
  );
  await writeNote(
    root,
    'motor.html',
    noteHtml({
      title: 'Motor',
      id: NOTE_MOTOR,
      tags: 'indice',
      body: 'El cuerpo menciona sqlite.',
    }),
  );
  await writeNote(
    root,
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
  await writeNote(
    root,
    'alias.html',
    noteHtml({
      title: 'Nota',
      id: NOTE_ALIAS,
      aliases: 'Apodo único',
      body: 'cuerpo limpio',
    }),
  );
  await writeNote(
    root,
    'encabezado.html',
    noteHtml({
      title: 'Texto',
      id: NOTE_HEAD,
      body: 'parrafo',
      extra: '<section id="motor"><h2>Encabezado buscable</h2><p>dentro</p></section>',
    }),
  );
}

it('is registered on the default command list', () => {
  expect(commands.map((command) => command.name)).toContain('search');
});

it('returns the note whose body mentions sqlite first, with a highlighted snippet', async () => {
  await withTemp(async (parent) => {
    const root = await makeVault(parent);
    await writeNote(
      root,
      'aaa.html',
      noteHtml({ title: 'Alfa', id: NOTE_OTRA, body: 'sin coincidencia' }),
    );
    await writeNote(
      root,
      'motor.html',
      noteHtml({
        title: 'Motor',
        id: NOTE_MOTOR,
        tags: 'indice',
        body: 'El cuerpo menciona sqlite.',
      }),
    );
    const captured = capture(root);
    expect(await runCli(argv('search', 'sqlite', '--json'), captured.io)).toBe(EXIT_CODES.ok);
    expect(captured.stderr()).toBe('');
    expect(captured.stderr()).not.toContain('ExperimentalWarning');
    const body = parseEnvelope(captured.stdout());
    expect(body).toMatchObject({
      ok: true,
      schemaVersion: 1,
      command: 'search',
      warnings: [],
    });
    expect(body.data.query).toBe('sqlite');
    expect(body.data.type).toBeNull();
    expect(body.data.tag).toBeNull();
    expect(body.data.limit).toBe(SEARCH_DEFAULT_LIMIT);
    expect(body.data.hits[0]).toMatchObject({
      path: 'motor.html',
      id: NOTE_MOTOR,
      title: 'Motor',
      type: 'doc',
      tags: ['indice'],
    });
    const snippet = body.data.hits[0]?.snippet ?? '';
    expect(snippet).toContain(`${SEARCH_SNIPPET_START}sqlite${SEARCH_SNIPPET_END}`);
    expect(body.data.hits.map((hit) => hit.path)).not.toContain('aaa.html');
    expect(body.data.hits.every((hit) => hit.snippet.includes(SEARCH_SNIPPET_START))).toBe(true);
  });
});

it('searches title, alias, and headings, ignoring case and accents', async () => {
  await withTemp(async (parent) => {
    const root = await makeVault(parent);
    await seedVault(root);
    await writeNote(
      root,
      'indice.html',
      noteHtml({ title: 'Índice', id: NOTE_MOTOR, body: 'tabla' }),
    );

    const title = capture(root);
    expect(await runCli(argv('--json', 'search', 'indice'), title.io)).toBe(EXIT_CODES.ok);
    expect(parseEnvelope(title.stdout()).data.hits[0]?.path).toBe('indice.html');

    const alias = capture(root);
    expect(await runCli(argv('search', '--json', 'apodo'), alias.io)).toBe(EXIT_CODES.ok);
    expect(parseEnvelope(alias.stdout()).data.hits.map((hit) => hit.path)).toContain('alias.html');

    const heading = capture(root);
    expect(await runCli(argv('search', 'encabezado', '--json'), heading.io)).toBe(EXIT_CODES.ok);
    expect(parseEnvelope(heading.stdout()).data.hits.map((hit) => hit.path)).toContain(
      'encabezado.html',
    );
  });
});

it('filters by type and tag and respects limit', async () => {
  await withTemp(async (parent) => {
    const root = await makeVault(parent);
    await seedVault(root);

    const slides = capture(root);
    expect(await runCli(argv('search', 'sqlite', '--type', 'slides', '--json'), slides.io)).toBe(
      EXIT_CODES.ok,
    );
    const slidesBody = parseEnvelope(slides.stdout());
    expect(slidesBody.data.type).toBe('slides');
    expect(slidesBody.data.hits.map((hit) => hit.path)).toEqual(['lamina.html']);

    const docs = capture(root);
    expect(
      await runCli(argv('search', '--tag', 'indice', '--type', 'doc', 'sqlite', '--json'), docs.io),
    ).toBe(EXIT_CODES.ok);
    const docsBody = parseEnvelope(docs.stdout());
    expect(docsBody.data).toMatchObject({ type: 'doc', tag: 'indice' });
    expect(docsBody.data.hits.map((hit) => hit.path)).toEqual(['motor.html']);

    const limited = capture(root);
    expect(await runCli(argv('search', 'sqlite', '--limit', '1', '--json'), limited.io)).toBe(
      EXIT_CODES.ok,
    );
    const limitedBody = parseEnvelope(limited.stdout());
    expect(limitedBody.data.limit).toBe(1);
    expect(limitedBody.data.hits).toHaveLength(1);
  });
});

it('matches a multi-word query as a phrase', async () => {
  await withTemp(async (parent) => {
    const root = await makeVault(parent);
    await writeNote(
      root,
      'frase.html',
      noteHtml({
        title: 'Frase',
        id: '01JB2F6R8V1G3H5J7K9L1M4N5Q',
        body: 'Usamos una base de datos local.',
      }),
    );
    await writeNote(
      root,
      'suelta.html',
      noteHtml({
        title: 'Suelta',
        id: NOTE_OTRA,
        body: 'La base está lejos de otra datos.',
      }),
    );
    const phrase = capture(root);
    expect(await runCli(argv('search', '--json', 'base de datos'), phrase.io)).toBe(EXIT_CODES.ok);
    expect(parseEnvelope(phrase.stdout()).data.hits.map((hit) => hit.path)).toEqual(['frase.html']);
  });
});

it('prints a Spanish summary and says when nothing matches', async () => {
  await withTemp(async (parent) => {
    const root = await makeVault(parent);
    await seedVault(root);
    const human = capture(root);
    expect(await runCli(argv('search', 'sqlite'), human.io)).toBe(EXIT_CODES.ok);
    expect(human.stderr()).toBe('');
    expect(human.stdout().startsWith('{')).toBe(false);
    expect(human.stdout()).toContain('Motor');
    expect(human.stdout()).toContain('motor.html · doc · indice');
    expect(human.stdout()).toContain(`${SEARCH_SNIPPET_START}sqlite${SEARCH_SNIPPET_END}`);

    const empty = capture(root);
    expect(await runCli(argv('search', 'no-existe-esta-cadena'), empty.io)).toBe(EXIT_CODES.ok);
    expect(empty.stdout()).toBe('No hay notas que coincidan.\n');
    expect(empty.stderr()).toBe('');
  });
});

it('rejects a missing vault, an empty query, and filters outside the contract', async () => {
  await withTemp(async (parent) => {
    const root = await makeVault(parent);
    await seedVault(root);
    const elsewhere = join(parent, 'elsewhere');
    await mkdir(elsewhere);

    const missing = capture(elsewhere);
    expect(await runCli(argv('search', '--json', 'sqlite'), missing.io)).toBe(EXIT_CODES.notFound);
    expect(parseEnvelope(missing.stdout()).error).toMatchObject({
      code: 'E_VAULT_NOT_FOUND',
      message: formatDiagnostic('E_VAULT_NOT_FOUND').message,
      hint: formatDiagnostic('E_VAULT_NOT_FOUND').hint,
    });

    const blank = capture(root);
    expect(await runCli(argv('search', '   ', '--json'), blank.io)).toBe(EXIT_CODES.usage);
    expect(parseEnvelope(blank.stdout()).error?.details?.problem).toBe(
      'La consulta no puede estar vacía.',
    );

    const absent = capture(root);
    expect(await runCli(argv('search'), absent.io)).toBe(EXIT_CODES.usage);
    expect(absent.stderr()).toContain('Falta un argumento.');

    const type = capture(root);
    expect(await runCli(argv('search', 'sqlite', '--type', 'page', '--json'), type.io)).toBe(
      EXIT_CODES.usage,
    );
    expect(parseEnvelope(type.stdout()).error?.details?.problem).toBe(
      'El tipo tiene que ser doc, slides o todo.',
    );

    const tag = capture(root);
    expect(await runCli(argv('search', 'sqlite', '--tag', '   ', '--json'), tag.io)).toBe(
      EXIT_CODES.usage,
    );
    expect(parseEnvelope(tag.stdout()).error?.code).toBe('E_ARG_INVALID');

    for (const limit of ['0', '101', '1.5', 'abc', '01']) {
      const bad = capture(root);
      expect(await runCli(argv('search', 'sqlite', '--limit', limit, '--json'), bad.io)).toBe(
        EXIT_CODES.usage,
      );
      expect(parseEnvelope(bad.stdout()).error?.details?.problem).toBe(
        'El límite tiene que ser un entero entre 1 y 100.',
      );
    }

    const from = capture(root);
    expect(await runCli(argv('search', 'sqlite', '--from', '-'), from.io)).toBe(EXIT_CODES.usage);
    expect(from.stderr()).toContain('Este comando no admite contenido.');
  });
});

it('reuses a populated index and rebuilds after the cache is replaced', async () => {
  await withTemp(async (parent) => {
    const root = await makeVault(parent);
    await writeNote(
      root,
      'motor.html',
      noteHtml({ title: 'Motor', id: NOTE_MOTOR, body: 'El cuerpo menciona sqlite.' }),
    );
    const first = capture(root);
    expect(await runCli(argv('search', '--json', 'sqlite'), first.io)).toBe(EXIT_CODES.ok);
    expect(parseEnvelope(first.stdout()).data.hits).toHaveLength(1);

    await writeNote(
      root,
      'motor.html',
      noteHtml({ title: 'Motor', id: NOTE_MOTOR, body: 'texto cambiada' }),
    );
    const stale = capture(root);
    expect(await runCli(argv('search', '--json', 'sqlite'), stale.io)).toBe(EXIT_CODES.ok);
    expect(parseEnvelope(stale.stdout()).data.hits).toHaveLength(1);
    const changed = capture(root);
    expect(await runCli(argv('search', '--json', 'cambiada'), changed.io)).toBe(EXIT_CODES.ok);
    expect(parseEnvelope(changed.stdout()).data.hits).toEqual([]);

    await writeFile(join(root, GAVETA_DIRECTORY, 'index.sqlite'), 'not a database');
    const recovered = capture(root);
    expect(await runCli(argv('search', '--json', 'cambiada'), recovered.io)).toBe(EXIT_CODES.ok);
    expect(recovered.stderr()).toBe('');
    const body = parseEnvelope(recovered.stdout());
    expect(body.warnings).toEqual([
      {
        code: 'W_INDEX_RECOVERED',
        message: formatDiagnostic('W_INDEX_RECOVERED').message,
        hint: formatDiagnostic('W_INDEX_RECOVERED').hint,
      },
    ]);
    expect(body.data.hits.map((hit) => hit.path)).toEqual(['motor.html']);

    const human = capture(root);
    await writeFile(join(root, GAVETA_DIRECTORY, 'index.sqlite'), 'not a database');
    expect(await runCli(argv('search', 'cambiada'), human.io)).toBe(EXIT_CODES.ok);
    expect(human.stderr()).toContain('W_INDEX_RECOVERED:');
    expect(human.stdout()).toContain('motor.html');
  });
});
