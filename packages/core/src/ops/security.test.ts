import {
  chmod,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { parse } from 'parse5';
import type { DefaultTreeAdapterMap } from 'parse5';
import { describe, expect, it } from 'vitest';
import { NOTE_X, vaultPath } from '@gaveta/fixtures';
import { GavetaError, moveNote, removeNote, type VaultIndex } from '../index.ts';
import { openVaultIndex } from '../sqlite/store.ts';

const NOTE_A = '01JB7Z3K9QX4T5M2N8V6R0WYHC';
const NOTE_B = '01JB8A2M4R7C9D1E3F5G7H9J0K';
const PAYLOAD = 'A"></a><script>alert(1)</script>';
const SQL = "'); DROP TABLE notes;--";

type ParseChild = DefaultTreeAdapterMap['childNode'];
type ParseElement = DefaultTreeAdapterMap['element'];

function themeHref(notePath: string): string {
  const depth = notePath.split('/').length - 1;
  return `${'../'.repeat(depth)}.gaveta/theme.css`;
}

function noteHtml(path: string, title: string, id: string, body: string): string {
  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <title>${title}</title>
    <meta name="gaveta:id" content="${id}" />
    <meta name="gaveta:type" content="doc" />
    <meta name="gaveta:created" content="2026-10-22T10:00:00Z" />
    <link rel="stylesheet" href="${themeHref(path)}" />
  </head>
  <body>
    <article>
      <h1>${title}</h1>
      ${body}
    </article>
  </body>
</html>
`;
}

async function withTemp(run: (directory: string) => Promise<void>): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), 'gaveta-mv-sec-'));
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

async function withIndex(root: string, run: (index: VaultIndex) => Promise<void>): Promise<void> {
  const index = await openVaultIndex(root);
  try {
    await index.rebuild();
    await run(index);
  } finally {
    index.close();
  }
}

function attribute(element: ParseElement, name: string): string | null {
  for (const attr of element.attrs) {
    if (attr.name.toLowerCase() === name) {
      return attr.value;
    }
  }
  return null;
}

function anchors(
  html: string,
): { href: string | null; to: string | null; pending: string | null }[] {
  const document = parse(html, { scriptingEnabled: false });
  const found: { href: string | null; to: string | null; pending: string | null }[] = [];
  const stack: ParseChild[] = [...document.childNodes];
  while (stack.length > 0) {
    const node = stack.pop();
    if (node === undefined || !isElement(node)) {
      continue;
    }
    if (node.tagName.toLowerCase() === 'a') {
      found.push({
        href: attribute(node, 'href'),
        to: attribute(node, 'data-g-to'),
        pending: attribute(node, 'data-g-pending'),
      });
    }
    for (let index = node.childNodes.length - 1; index >= 0; index -= 1) {
      const child = node.childNodes[index];
      if (child !== undefined) {
        stack.push(child);
      }
    }
  }
  return found;
}

function isElement(node: ParseChild): node is ParseElement {
  return (
    node.nodeName !== '#text' && node.nodeName !== '#comment' && node.nodeName !== '#documentType'
  );
}

describe('move and remove security', () => {
  it('rejects paths that leave the vault and does not create the target', async () => {
    await withTemp(async (parent) => {
      const root = await makeVault(parent);
      const outside = await mkdtemp(join(parent, 'outside-'));
      await symlink(outside, join(root, 'fuera'));
      await writeNote(root, 'nota.html', noteHtml('nota.html', 'Nota', NOTE_A, '<p>Dentro</p>'));
      const before = await readFile(join(root, 'nota.html'), 'utf8');
      await withIndex(root, async (index) => {
        const refused = [
          '../escaped.html',
          '/tmp/escaped.html',
          'enlaces/../../escaped.html',
          'fuera/pwn.html',
          'javascript:alert(1)',
          'nota\\..\\escaped.html',
          '.gaveta/theme.css',
          '.gaveta/nota.html',
        ];
        for (const destination of refused) {
          await expect(moveNote(index, 'nota.html', destination)).rejects.toBeInstanceOf(
            GavetaError,
          );
        }
        expect(await readFile(join(root, 'nota.html'), 'utf8')).toBe(before);
        expect(await readdir(outside)).toEqual([]);
      });
    });
  });

  it('rolls back incoming hrefs when a later write fails', async () => {
    await withTemp(async (parent) => {
      const root = await cpVault(parent);
      const linkerPath = join(root, 'enlaces/enlace-01.html');
      const notePath = join(root, NOTE_X.path);
      const linkerBefore = await readFile(linkerPath, 'utf8');
      const noteBefore = await stat(notePath);
      await mkdir(join(root, 'sealed'), { mode: 0o755 });
      await chmod(join(root, 'sealed'), 0o555);
      try {
        await withIndex(root, async (index) => {
          const seen = await stat(linkerPath);
          await expect(moveNote(index, NOTE_X.path, 'sealed/x.html')).rejects.toMatchObject({
            code: 'EACCES',
          });
          expect(await readFile(linkerPath, 'utf8')).toBe(linkerBefore);
          const seenAfter = await stat(linkerPath);
          expect(seenAfter.mtimeMs).toBeGreaterThan(seen.mtimeMs);
          expect((await stat(notePath)).mtimeMs).toBe(noteBefore.mtimeMs);
          expect(await readdir(join(root, 'sealed'))).toEqual([]);
          const names = await readdir(join(root, 'enlaces'));
          expect(names.some((name) => name.includes('.tmp'))).toBe(false);
          expect(index.note(NOTE_X.path)?.path).toBe(NOTE_X.path);
        });
      } finally {
        await chmod(join(root, 'sealed'), 0o755);
      }
    });
  });

  it('treats hostile markup as data while rewriting the real anchor', async () => {
    await withTemp(async (parent) => {
      const root = await makeVault(parent);
      const script = `<script>alert(1)</script><p onclick="alert(1)">x</p>`;
      await writeNote(
        root,
        'destino.html',
        noteHtml('destino.html', 'Destino', NOTE_B, '<p>Ok</p>'),
      );
      await writeNote(
        root,
        'hostil.html',
        noteHtml(
          'hostil.html',
          'Hostil',
          NOTE_A,
          `${script}<p><a href="destino.html" data-g-to="${NOTE_B}" rel="related">Destino</a></p><p><img src="javascript:alert(1)" alt="no" /></p>`,
        ),
      );
      await withIndex(root, async (index) => {
        await moveNote(index, 'destino.html', 'sub/destino.html');
        const html = await readFile(join(root, 'hostil.html'), 'utf8');
        expect(html).toContain('<script>alert(1)</script>');
        expect(html).toContain('onclick="alert(1)"');
        expect(html).toContain('src="javascript:alert(1)"');
        expect(html).toContain('href="sub/destino.html"');
        expect(anchors(html)).toContainEqual({
          href: 'sub/destino.html',
          to: NOTE_B,
          pending: null,
        });
      });
    });
  });

  it('escapes a hostile title when converting links to pending and keeps the index intact', async () => {
    await withTemp(async (parent) => {
      const root = await makeVault(parent);
      await writeNote(
        root,
        'malo.html',
        noteHtml('malo.html', PAYLOAD, NOTE_A, '<p>Titulo hostil</p>'),
      );
      await writeNote(
        root,
        'linker.html',
        noteHtml(
          'linker.html',
          'Linker',
          NOTE_B,
          `<p>Ve a <a href="malo.html" data-g-to="${NOTE_A}" rel="related">texto</a>.</p>`,
        ),
      );
      await withIndex(root, async (index) => {
        await removeNote(index, 'malo.html', { force: true });
        const html = await readFile(join(root, 'linker.html'), 'utf8');
        expect(html).not.toContain('<script>');
        expect(html).toContain(
          'data-g-pending="A&quot;&gt;&lt;/a&gt;&lt;script&gt;alert(1)&lt;/script&gt;"',
        );
        expect(html).toContain('>texto</a>');
        const parsed = anchors(html);
        expect(parsed).toContainEqual({ href: null, to: null, pending: PAYLOAD });
        expect(index.notes().map((note) => note.path)).toEqual(['linker.html']);
        expect(index.links().some((link) => link.pendingTitle === PAYLOAD)).toBe(true);

        await writeNote(root, 'sql.html', noteHtml('sql.html', SQL, NOTE_A, '<p>sql</p>'));
        await index.upsert('sql.html');
        const again = noteHtml(
          'linker.html',
          'Linker',
          NOTE_B,
          `<p><a href="sql.html" data-g-to="${NOTE_A}" rel="related">sql</a></p>`,
        );
        await writeNote(root, 'linker.html', again);
        await index.upsert('linker.html');
        await removeNote(index, 'sql.html', { force: true });
        expect(index.notes().some((note) => note.path === 'linker.html')).toBe(true);
        expect(index.links().some((link) => link.pendingTitle === SQL)).toBe(true);
      });
    });
  });

  it('rejects unknown option shapes and unsafe destinations before writing', async () => {
    await withTemp(async (parent) => {
      const root = await makeVault(parent);
      await writeNote(root, 'nota.html', noteHtml('nota.html', 'Nota', NOTE_A, '<p>Ok</p>'));
      const before = await readFile(join(root, 'nota.html'), 'utf8');
      await withIndex(root, async (index) => {
        await expect(removeNote(index, 'nota.html', { force: 'yes' })).rejects.toMatchObject({
          code: 'E_ARG_INVALID',
        });
        await expect(
          removeNote(index, 'nota.html', { force: true, extra: true }),
        ).rejects.toMatchObject({
          code: 'E_ARG_INVALID',
        });
        await expect(removeNote(index, 'nota.html', null)).rejects.toMatchObject({
          code: 'E_ARG_INVALID',
        });
        await expect(moveNote(index, 'nota.html', '')).rejects.toMatchObject({
          code: 'E_ARG_INVALID',
        });
        await expect(moveNote(index, 'nota.html', 'nota\0.html')).rejects.toBeInstanceOf(
          GavetaError,
        );
        expect(await readFile(join(root, 'nota.html'), 'utf8')).toBe(before);
      });
    });
  });
});

async function cpVault(parent: string): Promise<string> {
  const root = join(parent, 'backlinks');
  await cp(vaultPath('backlinks'), root, { recursive: true });
  return root;
}
