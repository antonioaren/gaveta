import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { parse } from 'parse5';
import type { DefaultTreeAdapterMap } from 'parse5';
import { expect, it } from 'vitest';
import { GavetaError, isJavascriptUrl, resolveNoteLinks, resolveRef } from '../index.ts';
import { SELECT_NOTES_FOR_TITLE_FOLD, SELECT_PATHS_FOR_ALIAS_FOLD } from '../sqlite/schema.ts';
import { openVaultIndex, type VaultIndex } from '../sqlite/store.ts';

const NOTE_A = '01JB7Z3K9QX4T5M2N8V6R0WYHC';
const NOTE_B = '01JB8A2M4R7C9D1E3F5G7H9J0K';
const INJECTED = `'); DROP TABLE notes;--`;

type ParseChild = DefaultTreeAdapterMap['childNode'];
type ParseElement = DefaultTreeAdapterMap['element'];

function noteHtml(title: string, id: string, body: string): string {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${title}</title><meta name="gaveta:id" content="${id}"><meta name="gaveta:type" content="doc"><meta name="gaveta:created" content="2026-10-22T10:00:00Z"></head><body><article><h1>${title}</h1><p>${body}</p></article></body></html>`;
}

async function withTemp(run: (directory: string) => Promise<void>): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), 'gaveta-links-sec-'));
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

async function withIndex(
  root: string,
  run: (index: VaultIndex) => void | Promise<void>,
): Promise<void> {
  const index = await openVaultIndex(root);
  try {
    await index.rebuild();
    await run(index);
  } finally {
    index.close();
  }
}

function hrefsOf(html: string): string[] {
  const document = parse(html, { scriptingEnabled: false });
  const hrefs: string[] = [];
  const stack: ParseChild[] = [...document.childNodes];
  while (stack.length > 0) {
    const node = stack.pop();
    if (node === undefined || !isElement(node)) {
      continue;
    }
    if (node.tagName.toLowerCase() === 'a') {
      for (const attribute of node.attrs) {
        if (attribute.name.toLowerCase() === 'href') {
          hrefs.push(attribute.value);
        }
      }
    }
    for (let index = node.childNodes.length - 1; index >= 0; index -= 1) {
      const child = node.childNodes[index];
      if (child !== undefined) {
        stack.push(child);
      }
    }
  }
  return hrefs;
}

function isElement(node: ParseChild): node is ParseElement {
  return (
    node.nodeName !== '#text' && node.nodeName !== '#comment' && node.nodeName !== '#documentType'
  );
}

function expectSafeHrefs(html: string): void {
  for (const href of hrefsOf(html)) {
    expect(isJavascriptUrl(href)).toBe(false);
    expect(href.trim().toLowerCase().startsWith('data:')).toBe(false);
    expect(href.includes('..')).toBe(false);
  }
}

it('looks up titles and aliases with bound parameters', async () => {
  expect(SELECT_NOTES_FOR_TITLE_FOLD).toContain('title_folded = ?');
  expect(SELECT_PATHS_FOR_ALIAS_FOLD).toContain('alias_folded = ?');
  expect(SELECT_NOTES_FOR_TITLE_FOLD.includes('${')).toBe(false);
  expect(SELECT_PATHS_FOR_ALIAS_FOLD.includes('${')).toBe(false);
  await withTemp(async (parent) => {
    const root = await makeVault(parent);
    await writeNote(root, 'a.html', noteHtml(INJECTED, NOTE_A, 'cuerpo'));
    await writeNote(root, 'b.html', noteHtml('Nota sana', NOTE_B, 'visible'));
    await withIndex(root, (index) => {
      expect(index.notesMatchingTitle(INJECTED)).toHaveLength(1);
      expect(resolveRef(index, INJECTED)).toMatchObject({ path: 'a.html', title: INJECTED });
      expect(index.notes()).toHaveLength(2);
      expect(index.note('b.html')?.title).toBe('Nota sana');
    });
  });
});

it('rejects path traversal in refs and does not read outside the vault', async () => {
  await withTemp(async (parent) => {
    const root = await makeVault(parent);
    const secret = join(parent, 'secret.html');
    await writeFile(secret, noteHtml('Secreto', NOTE_B, 'TOP-SECRET'));
    await writeNote(root, 'a.html', noteHtml('Alfa', NOTE_A, 'visible'));
    await withIndex(root, (index) => {
      for (const ref of [
        '../secret.html',
        'notes/../../secret.html',
        '/etc/passwd',
        '%2e%2e/%2e%2e/secret.html',
        'file:///etc/passwd',
        '..\\..\\secret.html',
      ]) {
        expect(() => resolveRef(index, ref)).toThrow(GavetaError);
        try {
          resolveRef(index, ref);
        } catch (error) {
          expect(error).toMatchObject({ code: 'E_PATH_OUTSIDE_VAULT' });
          expect(error instanceof Error ? error.message : '').not.toContain('TOP-SECRET');
        }
      }
      expect(() => resolveRef(index, 'javascript:alert(1)')).toThrow(GavetaError);
      expect(() => resolveRef(index, 'java\nscript:alert(1)')).toThrow(GavetaError);
      expect(() => resolveRef(index, 'data:text/html,hi')).toThrow(GavetaError);
      try {
        resolveRef(index, ' javascript:alert(1)');
      } catch (error) {
        expect(error).toMatchObject({ code: 'E_UNSAFE_URL' });
      }
      const pending = resolveNoteLinks({
        html: '<p>[[../../secret.html]]</p><p>[[javascript:alert(1)|&lt;script&gt;]]</p>',
        fromPath: 'a.html',
        index,
      });
      expect(pending.ok).toBe(true);
      expect(pending.html).not.toContain('TOP-SECRET');
      expect(pending.html).not.toContain('href');
      expect(pending.html).toContain('data-g-pending="../../secret.html"');
      expect(pending.html).toContain('data-g-pending="javascript:alert(1)"');
      expect(pending.html).toContain('&lt;script&gt;');
      expectSafeHrefs(pending.html);
      for (const link of pending.links) {
        expect(link.href).toBeNull();
      }
    });
  });
});

it('replaces a javascript href when data-g-to identifies a real note', async () => {
  await withTemp(async (parent) => {
    const root = await makeVault(parent);
    await writeNote(root, 'nota.html', noteHtml('Nota', NOTE_A, 'ok'));
    await withIndex(root, (index) => {
      const html = `<p><a href="javascript:alert(1)" data-g-to="${NOTE_A}">Nota</a></p><p><a href="data:text/html,hi">x</a></p>`;
      const result = resolveNoteLinks({ html, fromPath: 'otra.html', index });
      expect(result.ok).toBe(true);
      expect(result.html).toContain('href="nota.html"');
      expect(result.html).not.toContain('javascript:');
      expect(result.html).toContain('href="data:text/html,hi"');
      const produced = hrefsOf(result.html).filter((href) => href !== 'data:text/html,hi');
      expect(produced).toEqual(['nota.html']);
      for (const link of result.links) {
        expect(link.href === null || link.href === 'nota.html').toBe(true);
      }
      const quoted = resolveNoteLinks({
        html: '<p>[[Tom & "Jerry"]]</p>',
        fromPath: 'otra.html',
        index,
      });
      expect(quoted.html).toBe(
        '<p><a data-g-pending="Tom &amp; &quot;Jerry&quot;">Tom &amp; "Jerry"</a></p>',
      );
      expect(hrefsOf(quoted.html)).toEqual([]);
    });
  });
});

it('does not follow a ref into a file outside the copied fixture', async () => {
  await withTemp(async (parent) => {
    const root = await makeVault(parent);
    await writeNote(root, 'a.html', noteHtml('Alfa', NOTE_A, 'dentro'));
    await withIndex(root, async (index) => {
      const outside = await readFile(join(parent, 'no-such'), 'utf8').catch(() => '');
      expect(outside).toBe('');
      expect(resolveRef(index, 'a.html').path).toBe('a.html');
      expect(index.notes()).toHaveLength(1);
    });
  });
});
