import '../sqlite/warning.ts';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { GavetaError, noteContentHash, openVaultIndex } from '../index.ts';
import { linkUnlinkedMentions, rewriteUnlinkedMentions, unlinkedMentions } from './mentions.ts';

const TARGET_ID = '01JB7Z3K9QX4T5M2N8V6R0WYHC';
const SOURCE_ID = '01JB7Z3K9QX4T5M2N8V6R0WYHD';
const OTHER_ID = '01JB7Z3K9QX4T5M2N8V6R0WYHE';

function escapeText(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function noteHtml(options: {
  readonly title: string;
  readonly id: string;
  readonly aliases?: string;
  readonly body: string;
}): string {
  const head = [
    '<meta charset="utf-8">',
    `<title>${escapeText(options.title)}</title>`,
    `<meta name="gaveta:id" content="${escapeText(options.id)}">`,
    '<meta name="gaveta:type" content="doc">',
    '<meta name="gaveta:created" content="2026-10-22T10:00:00Z">',
  ];
  if (options.aliases !== undefined) {
    head.push(`<meta name="gaveta:aliases" content="${escapeText(options.aliases)}">`);
  }
  return `<!doctype html><html lang="es"><head>${head.join('')}</head><body><article><h1>${escapeText(options.title)}</h1>${options.body}</article></body></html>`;
}

async function withVault(
  files: Record<string, string>,
  run: (root: string) => Promise<void>,
): Promise<void> {
  const parent = await mkdtemp(join(tmpdir(), 'gaveta-mentions-'));
  const root = join(parent, 'vault');
  try {
    await mkdir(join(root, '.gaveta'), { recursive: true });
    await writeFile(
      join(root, '.gaveta/config.json'),
      JSON.stringify({
        rel: {
          vocabulary: ['related', 'depends-on', 'part-of', 'supersedes', 'references'],
          strict: false,
        },
        remoteAllowlist: [],
      }),
      'utf8',
    );
    for (const [name, html] of Object.entries(files)) {
      await writeFile(join(root, name), html, 'utf8');
    }
    await run(root);
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
}

describe('unlinkedMentions', () => {
  it('lists plain-text title and alias matches and ignores links, code, and wikilinks', async () => {
    await withVault(
      {
        'roadmap.html': noteHtml({
          title: 'Roadmap',
          id: TARGET_ID,
          aliases: 'hoja de ruta',
          body: '<p>meta</p>',
        }),
        'origen.html': noteHtml({
          title: 'Origen',
          id: SOURCE_ID,
          body: [
            '<p>Ver Roadmap pronto.</p>',
            '<p><a href="roadmap.html" data-g-to="' + TARGET_ID + '">Roadmap</a></p>',
            '<p>La hoja de ruta cambió.</p>',
            '<p>[[Roadmap]]</p>',
            '<pre><code>Roadmap</code></pre>',
          ].join(''),
        }),
      },
      async (root) => {
        const index = await openVaultIndex(root);
        try {
          await index.rebuild();
          const found = await unlinkedMentions(root, index, 'Roadmap');
          expect(found.map((row) => row.text)).toEqual(['Roadmap', 'hoja de ruta']);
          expect(found.every((row) => row.sourcePath === 'origen.html')).toBe(true);
          expect(found[0]?.matchedBy).toBe('title');
          expect(found[1]?.matchedBy).toBe('alias');
          expect(found[0]?.context).toContain('Roadmap');
        } finally {
          index.close();
        }
      },
    );
  });

  it('matches case and accents with foldMatchKey boundaries', async () => {
    await withVault(
      {
        'indice.html': noteHtml({ title: 'Índice SQLite', id: TARGET_ID, body: '<p>x</p>' }),
        'origen.html': noteHtml({
          title: 'Origen',
          id: SOURCE_ID,
          body: '<p>Usa indice sqlite aquí.</p>',
        }),
      },
      async (root) => {
        const index = await openVaultIndex(root);
        try {
          await index.rebuild();
          const found = await unlinkedMentions(root, index, 'Índice SQLite');
          expect(found).toHaveLength(1);
          expect(found[0]?.text).toBe('indice sqlite');
        } finally {
          index.close();
        }
      },
    );
  });
});

describe('rewriteUnlinkedMentions', () => {
  it('wraps plain mentions in canonical anchors without touching existing links', () => {
    const html = noteHtml({
      title: 'Origen',
      id: SOURCE_ID,
      body: '<p>Ver Roadmap y la hoja de ruta.</p>',
    });
    const result = rewriteUnlinkedMentions({
      html,
      fromPath: 'origen.html',
      target: {
        id: TARGET_ID,
        path: 'roadmap.html',
        title: 'Roadmap',
        aliases: ['hoja de ruta'],
      },
    });
    expect(result.linked).toBe(2);
    expect(result.html).toContain(`data-g-to="${TARGET_ID}"`);
    expect(result.html).toContain('>Roadmap</a>');
    expect(result.html).toContain('>hoja de ruta</a>');
  });
});

describe('linkUnlinkedMentions', () => {
  it('links every mention in the vault and honors if-match per source note', async () => {
    await withVault(
      {
        'roadmap.html': noteHtml({ title: 'Roadmap', id: TARGET_ID, body: '<p>x</p>' }),
        'uno.html': noteHtml({
          title: 'Uno',
          id: OTHER_ID,
          body: '<p>Roadmap aquí.</p>',
        }),
        'dos.html': noteHtml({
          title: 'Dos',
          id: '01JB7Z3K9QX4T5M2N8V6R0WYHF',
          body: '<p>Otro Roadmap.</p>',
        }),
      },
      async (root) => {
        const unoBefore = await readFile(join(root, 'uno.html'), 'utf8');
        const dosBefore = await readFile(join(root, 'dos.html'), 'utf8');
        const linked = await linkUnlinkedMentions({
          vaultRoot: root,
          ref: TARGET_ID,
          ifMatches: {
            'uno.html': noteContentHash(unoBefore),
            'dos.html': noteContentHash(dosBefore),
          },
        });
        expect(linked.notes.map((note) => note.path).sort()).toEqual(['dos.html', 'uno.html']);
        const unoAfter = await readFile(join(root, 'uno.html'), 'utf8');
        expect(unoAfter).toContain(`data-g-to="${TARGET_ID}"`);
        const index = await openVaultIndex(root);
        try {
          await index.rebuild();
          expect(await unlinkedMentions(root, index, TARGET_ID)).toHaveLength(0);
        } finally {
          index.close();
        }
      },
    );
  });

  it('rejects a stale if-match with E_CONFLICT', async () => {
    await withVault(
      {
        'roadmap.html': noteHtml({ title: 'Roadmap', id: TARGET_ID, body: '<p>x</p>' }),
        'uno.html': noteHtml({
          title: 'Uno',
          id: OTHER_ID,
          body: '<p>Roadmap aquí.</p>',
        }),
      },
      async (root) => {
        const unoBefore = await readFile(join(root, 'uno.html'), 'utf8');
        await expect(
          linkUnlinkedMentions({
            vaultRoot: root,
            ref: TARGET_ID,
            ifMatches: { 'uno.html': noteContentHash(`${unoBefore}x`) },
          }),
        ).rejects.toBeInstanceOf(GavetaError);
        await expect(
          linkUnlinkedMentions({
            vaultRoot: root,
            ref: TARGET_ID,
            ifMatches: { 'uno.html': noteContentHash(`${unoBefore}x`) },
          }),
        ).rejects.toMatchObject({ code: 'E_CONFLICT' });
      },
    );
  });
});
