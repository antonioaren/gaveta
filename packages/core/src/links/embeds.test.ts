import '../sqlite/warning.ts';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { openVaultIndex, readNote } from '../index.ts';
import { MAX_EMBED_DEPTH, expandEmbedsInRenderBody, replaceEmbedsWithLinks } from './embeds.ts';

const HOST_ID = '01JB7Z3K9QX4T5M2N8V6R0WYHD';
const TARGET_ID = '01JB7Z3K9QX4T5M2N8V6R0WYHC';

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
  readonly body: string;
}): string {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${escapeText(options.title)}</title><meta name="gaveta:id" content="${escapeText(options.id)}"><meta name="gaveta:type" content="doc"><meta name="gaveta:created" content="2026-10-22T10:00:00Z"></head><body><article><h1>${escapeText(options.title)}</h1>${options.body}</article></body></html>`;
}

async function withVault(
  files: Record<string, string>,
  run: (root: string, index: Awaited<ReturnType<typeof openVaultIndex>>) => Promise<void>,
): Promise<void> {
  const parent = await mkdtemp(join(tmpdir(), 'gaveta-embeds-'));
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
    for (const [path, html] of Object.entries(files)) {
      const full = join(root, path);
      const dir = path.includes('/') ? join(root, path.split('/').slice(0, -1).join('/')) : root;
      await mkdir(dir, { recursive: true });
      await writeFile(full, html, 'utf8');
    }
    const index = await openVaultIndex(root);
    await index.rebuild();
    await run(root, index);
    index.close();
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
}

const noopRewrite = (html: string): string => html;

describe('replaceEmbedsWithLinks', () => {
  it('replaces gaveta-embed with a canonical link to the target section', async () => {
    await withVault(
      {
        'host.html': noteHtml({
          id: HOST_ID,
          title: 'Host',
          body: `<section id="intro"><p>Before</p><gaveta-embed data-g-to="${TARGET_ID}" data-g-section="resumen"></gaveta-embed><p>After</p></section>`,
        }),
        'target.html': noteHtml({
          id: TARGET_ID,
          title: 'Target note',
          body: '<section id="resumen"><h2>Resumen</h2><p>Body</p></section>',
        }),
      },
      async (root, index) => {
        const host = await readFile(join(root, 'host.html'), 'utf8');
        const out = replaceEmbedsWithLinks(host, 'host.html', index);
        expect(out).not.toContain('gaveta-embed');
        expect(out).toContain(`data-g-to="${TARGET_ID}"`);
        expect(out).toContain('href="target.html#resumen"');
        expect(out).toContain('Target note');
      },
    );
  });
});

describe('expandEmbedsInRenderBody', () => {
  it('inlines the embedded section HTML for app render', async () => {
    await withVault(
      {
        'host.html': noteHtml({
          id: HOST_ID,
          title: 'Host',
          body: `<section id="intro"><gaveta-embed data-g-to="${TARGET_ID}" data-g-section="resumen"></gaveta-embed></section>`,
        }),
        'target.html': noteHtml({
          id: TARGET_ID,
          title: 'Target note',
          body: '<section id="resumen"><h2>Resumen</h2><p>Embedded paragraph</p></section>',
        }),
      },
      async (root, index) => {
        const body =
          '<section id="intro"><gaveta-embed data-g-to="' +
          TARGET_ID +
          '" data-g-section="resumen"></gaveta-embed></section>';
        const expanded = await expandEmbedsInRenderBody(body, {
          hostNoteId: HOST_ID,
          hostNotePath: 'host.html',
          index,
          vaultRoot: root,
          remoteAllowlist: [],
          chain: [HOST_ID],
          depth: 0,
          rewriteAssets: noopRewrite,
          loadNoteHtml: async (path) => readFile(join(root, path), 'utf8'),
        });
        expect(expanded).not.toContain('gaveta-embed');
        expect(expanded).toContain('Embedded paragraph');
        expect(expanded).toContain('<h2>Resumen</h2>');
      },
    );
  });

  it('stops on embed cycles with a visible fallback', async () => {
    await withVault(
      {
        'a.html': noteHtml({
          id: '01JB7Z3K9QX4T5M2N8V6R0WYHA',
          title: 'A',
          body: `<section id="resumen"><gaveta-embed data-g-to="01JB7Z3K9QX4T5M2N8V6R0WYHB" data-g-section="resumen"></gaveta-embed></section>`,
        }),
        'b.html': noteHtml({
          id: '01JB7Z3K9QX4T5M2N8V6R0WYHB',
          title: 'B',
          body: `<section id="resumen"><gaveta-embed data-g-to="01JB7Z3K9QX4T5M2N8V6R0WYHA" data-g-section="resumen"></gaveta-embed></section>`,
        }),
      },
      async (root, index) => {
        const body = `<gaveta-embed data-g-to="01JB7Z3K9QX4T5M2N8V6R0WYHB" data-g-section="resumen"></gaveta-embed>`;
        const expanded = await expandEmbedsInRenderBody(body, {
          hostNoteId: '01JB7Z3K9QX4T5M2N8V6R0WYHA',
          hostNotePath: 'a.html',
          index,
          vaultRoot: root,
          remoteAllowlist: [],
          chain: ['01JB7Z3K9QX4T5M2N8V6R0WYHA'],
          depth: 0,
          rewriteAssets: noopRewrite,
          loadNoteHtml: async (path) => readFile(join(root, path), 'utf8'),
        });
        expect(expanded).toContain('data-g-code="W_EMBED_CYCLE"');
        expect(expanded).not.toMatch(/<gaveta-embed\b/u);
      },
    );
  });

  it('stops when embed depth exceeds the limit', async () => {
    const ids: string[] = [];
    const files: Record<string, string> = {};
    for (let i = 0; i < MAX_EMBED_DEPTH + 2; i += 1) {
      ids.push(`01M5HGV88000000000000000${String(20 + i).padStart(2, '0')}`);
    }
    for (let i = 0; i < ids.length; i += 1) {
      const id = ids[i];
      if (id === undefined) {
        throw new Error('expected id');
      }
      const next = ids[i + 1];
      const body =
        next === undefined
          ? '<section id="resumen"><p>Leaf</p></section>'
          : `<section id="resumen"><gaveta-embed data-g-to="${next}" data-g-section="resumen"></gaveta-embed></section>`;
      files[`n-${String(i)}.html`] = noteHtml({ id, title: `N${String(i)}`, body });
    }
    await withVault(files, async (root, index) => {
      const hostId = ids[0];
      const nextId = ids[1];
      if (hostId === undefined || nextId === undefined) {
        throw new Error('expected chained ids');
      }
      const body = `<gaveta-embed data-g-to="${nextId}" data-g-section="resumen"></gaveta-embed>`;
      const expanded = await expandEmbedsInRenderBody(body, {
        hostNoteId: hostId,
        hostNotePath: 'n-0.html',
        index,
        vaultRoot: root,
        remoteAllowlist: [],
        chain: [hostId],
        depth: 0,
        rewriteAssets: noopRewrite,
        loadNoteHtml: async (path) => readFile(join(root, path), 'utf8'),
      });
      expect(expanded).toContain('data-g-code="W_EMBED_DEPTH"');
    });
  });
});

describe('readNote', () => {
  it('returns html with embeds replaced by links outside the app', async () => {
    await withVault(
      {
        'host.html': noteHtml({
          id: HOST_ID,
          title: 'Host',
          body: `<gaveta-embed data-g-to="${TARGET_ID}" data-g-section="resumen"></gaveta-embed>`,
        }),
        'target.html': noteHtml({
          id: TARGET_ID,
          title: 'Target note',
          body: '<section id="resumen"><p>Body</p></section>',
        }),
      },
      async (root) => {
        const note = await readNote({ vaultRoot: root, ref: HOST_ID, as: 'html' });
        if (note.as !== 'html') {
          throw new Error('expected html');
        }
        expect(note.html).not.toContain('gaveta-embed');
        expect(note.html).toContain('href="target.html#resumen"');
      },
    );
  });
});
