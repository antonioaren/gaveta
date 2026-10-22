import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import {
  EXIT_CODES,
  GAVETA_DIRECTORY,
  SEARCH_SNIPPET_END,
  SEARCH_SNIPPET_START,
  createDefaultVaultConfig,
  writeVaultConfig,
} from '@gaveta/core';
import { expect, it } from 'vitest';
import { runCli, type CliIo } from '../run.ts';

const NOTE_A = '01JB7Z3K9QX4T5M2N8V6R0WYHC';
const NOTE_B = '01JB8A2M4R7C9D1E3F5G7H9J0K';
const PAYLOAD = `'); DROP TABLE notes;--`;

interface Hit {
  path: string;
  snippet: string;
}

function noteHtml(options: {
  readonly title: string;
  readonly id: string;
  readonly body: string;
}): string {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${options.title}</title><meta name="gaveta:id" content="${options.id}"><meta name="gaveta:type" content="doc"><meta name="gaveta:created" content="2026-10-22T10:00:00Z"></head><body><article><h1>${options.title}</h1><p>${options.body}</p></article></body></html>`;
}

async function withTemp(run: (directory: string) => Promise<void>): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), 'gaveta-search-sec-'));
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

function hits(stdout: string): Hit[] {
  const body = JSON.parse(stdout) as { data: { hits: Hit[] } };
  return body.data.hits;
}

function assertOnlyMarkTags(snippet: string): void {
  let index = 0;
  while (index < snippet.length) {
    const open = snippet.indexOf('<', index);
    if (open === -1) {
      return;
    }
    const mark = snippet.startsWith(SEARCH_SNIPPET_START, open);
    const close = snippet.startsWith(SEARCH_SNIPPET_END, open);
    expect(mark || close).toBe(true);
    index = open + 1;
  }
}

it('treats FTS operators and SQL text as data and keeps the index', async () => {
  await withTemp(async (parent) => {
    const root = await makeVault(parent);
    await writeNote(
      root,
      'a.html',
      noteHtml({ title: 'Alfa', id: NOTE_A, body: 'visible sqlite' }),
    );
    await writeNote(
      root,
      'b.html',
      noteHtml({ title: 'Beta', id: NOTE_B, body: 'secreto aparte' }),
    );

    const injected = capture(root);
    expect(await runCli(argv('search', '--json', PAYLOAD), injected.io)).toBe(EXIT_CODES.ok);
    expect(injected.stderr()).toBe('');
    expect(injected.stdout()).not.toContain('SQLITE');
    expect(injected.stdout().toLowerCase()).not.toContain('syntax error');
    expect(hits(injected.stdout())).toEqual([]);

    const operators = capture(root);
    expect(await runCli(argv('search', '--json', 'sqlite OR secreto'), operators.io)).toBe(
      EXIT_CODES.ok,
    );
    expect(hits(operators.stdout())).toEqual([]);

    const malformed = capture(root);
    expect(await runCli(argv('search', '--json', 'sqlite OR "'), malformed.io)).toBe(EXIT_CODES.ok);
    expect(malformed.stdout()).not.toContain('unterminated');
    expect(hits(malformed.stdout())).toEqual([]);

    const hyphen = capture(root);
    expect(await runCli(argv('search', '--json', 'full-text'), hyphen.io)).toBe(EXIT_CODES.ok);
    expect(hyphen.stdout()).not.toContain('no such column');

    const still = capture(root);
    expect(await runCli(argv('search', '--json', 'sqlite'), still.io)).toBe(EXIT_CODES.ok);
    expect(hits(still.stdout()).map((hit) => hit.path)).toEqual(['a.html']);
    expect(existsSync(join(root, GAVETA_DIRECTORY, 'index.sqlite'))).toBe(true);
    expect(existsSync(join(parent, 'index.sqlite'))).toBe(false);
  });
});

it('does not let tag, type, or limit filters change the query into SQL', async () => {
  await withTemp(async (parent) => {
    const root = await makeVault(parent);
    await writeNote(
      root,
      'a.html',
      noteHtml({ title: 'Alfa', id: NOTE_A, body: 'visible sqlite' }),
    );

    const tag = capture(root);
    expect(await runCli(argv('search', '--json', 'sqlite', '--tag', `x' OR '1'='1`), tag.io)).toBe(
      EXIT_CODES.ok,
    );
    expect(hits(tag.stdout())).toEqual([]);

    const type = capture(root);
    expect(
      await runCli(argv('search', '--json', 'sqlite', '--type', `doc' OR '1'='1`), type.io),
    ).toBe(EXIT_CODES.usage);
    expect(type.stdout()).not.toContain('SQLITE');

    const limit = capture(root);
    expect(
      await runCli(argv('search', '--json', 'sqlite', '--limit', '1; DROP TABLE notes'), limit.io),
    ).toBe(EXIT_CODES.usage);
    expect(limit.stdout()).not.toContain('DROP TABLE');

    const again = capture(root);
    expect(await runCli(argv('search', '--json', 'sqlite'), again.io)).toBe(EXIT_CODES.ok);
    expect(hits(again.stdout())).toHaveLength(1);
  });
});

it('escapes unsafe markup in snippets and leaves only mark highlights', async () => {
  await withTemp(async (parent) => {
    const root = await makeVault(parent);
    await writeNote(
      root,
      'a.html',
      noteHtml({
        title: 'Alfa',
        id: NOTE_A,
        body: 'sqlite&lt;/mark&gt;&lt;script&gt;alert(1)&lt;/script&gt; &lt;img src=x onerror=alert(1)&gt;',
      }),
    );
    const json = capture(root);
    expect(await runCli(argv('search', '--json', 'sqlite'), json.io)).toBe(EXIT_CODES.ok);
    const snippet = hits(json.stdout())[0]?.snippet ?? '';
    expect(snippet).toContain(`${SEARCH_SNIPPET_START}sqlite${SEARCH_SNIPPET_END}`);
    expect(snippet).toContain('&lt;script&gt;');
    expect(snippet).toContain('&lt;img');
    expect(snippet).not.toContain('<script');
    expect(snippet.toLowerCase()).not.toContain('<img');
    assertOnlyMarkTags(snippet);
    expect(json.stdout()).not.toContain('<script');

    const human = capture(root);
    expect(await runCli(argv('search', 'sqlite'), human.io)).toBe(EXIT_CODES.ok);
    expect(human.stdout()).not.toContain('<script');
    expect(human.stdout().toLowerCase()).not.toContain('<img');
    expect(human.stderr()).toBe('');
  });
});

it('does not read a file outside the vault or follow an escaping symlink', async () => {
  await withTemp(async (parent) => {
    const root = await makeVault(parent);
    const secret = join(parent, 'secret.html');
    await writeFile(secret, noteHtml({ title: 'Secreto', id: NOTE_B, body: 'TOP-SECRET sqlite' }));
    await symlink(secret, join(root, 'leak.html'));
    await symlink(parent, join(root, 'escape'));
    await writeNote(
      root,
      'a.html',
      noteHtml({ title: 'Alfa', id: NOTE_A, body: 'visible sqlite' }),
    );

    const searched = capture(root);
    expect(await runCli(argv('search', '--json', 'sqlite'), searched.io)).toBe(EXIT_CODES.ok);
    expect(searched.stdout()).not.toContain('TOP-SECRET');
    expect(searched.stderr()).not.toContain('TOP-SECRET');
    expect(hits(searched.stdout()).map((hit) => hit.path)).toEqual(['a.html']);
    for (const hit of hits(searched.stdout())) {
      expect(hit.path.startsWith('/')).toBe(false);
      expect(hit.path.includes('..')).toBe(false);
    }

    const queryPath = capture(root);
    expect(await runCli(argv('search', '--json', '../secret.html'), queryPath.io)).toBe(
      EXIT_CODES.ok,
    );
    expect(queryPath.stdout()).not.toContain('TOP-SECRET');
    expect(hits(queryPath.stdout())).toEqual([]);
    expect(await readFile(secret, 'utf8')).toContain('TOP-SECRET');

    const escaped = capture(root);
    expect(
      await runCli(argv('search', '--json', 'sqlite', '--vault', '../secret.html'), escaped.io),
    ).toBe(EXIT_CODES.notFound);
    expect(escaped.stdout()).not.toContain('TOP-SECRET');

    const child = join(root, 'child');
    const outside = join(parent, 'outside');
    await mkdir(child);
    await mkdir(outside);
    await writeFile(join(outside, 'secret.txt'), 'TOP-SECRET');
    await symlink(outside, join(child, GAVETA_DIRECTORY), 'dir');
    const linked = capture(child);
    expect(await runCli(argv('search', '--json', 'sqlite'), linked.io)).toBe(EXIT_CODES.usage);
    expect(linked.stdout()).not.toContain('TOP-SECRET');
    expect(linked.stderr()).not.toContain('TOP-SECRET');
    expect(JSON.parse(linked.stdout())).toMatchObject({ error: { code: 'E_PATH_OUTSIDE_VAULT' } });
  });
});
