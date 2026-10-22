import { chmod, mkdtemp, mkdir, readdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { parse } from 'parse5';
import type { DefaultTreeAdapterMap } from 'parse5';
import { expect, it } from 'vitest';
import {
  GavetaError,
  isJavascriptUrl,
  promotePendingAnchors,
  promotePendingLinks,
} from '../index.ts';
import { openVaultIndex, type VaultIndex } from '../sqlite/store.ts';

const SOURCE_ID = '01JB7Z3K9QX4T5M2N8V6R0WYHC';
const OTHER_ID = '01JB8A2M4R7C9D1E3F5G7H9J0K';
const CREATED_ID = '01JB9C3N5S8D0E2F4G6H8J1K2M';
const PAYLOAD = `'); DROP TABLE notes;--`;
const BREAKOUT = '"><script>alert(1)</script>';

type ParseChild = DefaultTreeAdapterMap['childNode'];
type ParseElement = DefaultTreeAdapterMap['element'];

function noteHtml(title: string, id: string, body: string): string {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${title}</title><meta name="gaveta:id" content="${id}"><meta name="gaveta:type" content="doc"><meta name="gaveta:created" content="2026-10-22T10:00:00Z"></head><body><article><h1>${title}</h1><p>${body}</p></article></body></html>`;
}

async function withTemp(run: (directory: string) => Promise<void>): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), 'gaveta-promote-sec-'));
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

function anchorsOf(
  html: string,
): { href: string | null; pending: string | null; target: string | null }[] {
  const document = parse(html, { scriptingEnabled: false });
  const found: { href: string | null; pending: string | null; target: string | null }[] = [];
  const stack: ParseChild[] = [...document.childNodes];
  while (stack.length > 0) {
    const node = stack.pop();
    if (node === undefined || !isElement(node)) {
      continue;
    }
    if (node.tagName.toLowerCase() === 'a') {
      found.push({
        href: attribute(node, 'href'),
        pending: attribute(node, 'data-g-pending'),
        target: attribute(node, 'data-g-to'),
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

function attribute(element: ParseElement, name: string): string | null {
  for (const attr of element.attrs) {
    if (attr.name.toLowerCase() === name) {
      return attr.value;
    }
  }
  return null;
}

function isElement(node: ParseChild): node is ParseElement {
  return (
    node.nodeName !== '#text' && node.nodeName !== '#comment' && node.nodeName !== '#documentType'
  );
}

function countExact(haystack: string, needle: string): number {
  let count = 0;
  let cursor = 0;
  while (cursor < haystack.length) {
    const found = haystack.indexOf(needle, cursor);
    if (found === -1) {
      return count;
    }
    count += 1;
    cursor = found + needle.length;
  }
  return count;
}

it('treats a hostile pending title as data and never copies it into the href', () => {
  const html = `<p><a data-g-pending="${PAYLOAD.replaceAll('"', '&quot;')}">x</a></p><script>alert(1)</script>`;
  const result = promotePendingAnchors({
    html,
    fromPath: 'a.html',
    note: { id: CREATED_ID, path: 'docs/nota.html', title: PAYLOAD },
  });
  expect(result.html).not.toContain(PAYLOAD);
  expect(result.html).not.toContain('DROP TABLE');
  expect(result.html).toContain('<script>alert(1)</script>');
  expect(countExact(result.html, '<script>')).toBe(1);
  expect(countExact(result.html, '</script>')).toBe(1);
  const anchor = anchorsOf(result.html)[0];
  expect(anchor).toEqual({
    href: 'docs/nota.html',
    pending: null,
    target: CREATED_ID,
  });
  expect(anchor === undefined || isJavascriptUrl(anchor.href ?? '')).toBe(false);

  const breakout = promotePendingAnchors({
    html: '<p><a data-g-pending="&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;">x</a></p>',
    fromPath: 'a.html',
    note: { id: CREATED_ID, path: 'nota.html', title: BREAKOUT, aliases: [BREAKOUT] },
  });
  expect(breakout.html).not.toContain('<script>');
  expect(breakout.html).not.toContain('onerror');
  expect(breakout.html).not.toContain('javascript:');
  expect(anchorsOf(breakout.html)).toEqual([
    { href: 'nota.html', pending: null, target: CREATED_ID },
  ]);
});

it('does not turn a traversal or javascript pending title into a link target', () => {
  const html =
    '<p><a data-g-pending="../../secret.html">x</a></p><p><a data-g-pending="javascript:alert(1)">y</a></p>';
  const result = promotePendingAnchors({
    html,
    fromPath: 'a.html',
    note: {
      id: CREATED_ID,
      path: 'roadmap.html',
      title: 'Roadmap',
      aliases: ['../../secret.html', 'javascript:alert(1)'],
    },
  });
  expect(result.html).not.toContain('secret.html');
  expect(result.html).not.toContain('javascript:');
  expect(result.html).not.toContain('data-g-pending');
  for (const anchor of anchorsOf(result.html)) {
    expect(anchor.href).toBe('roadmap.html');
    expect(anchor.href?.includes('..')).toBe(false);
    expect(anchor.target).toBe(CREATED_ID);
  }
});

it('does not follow a pending title or a target path outside the vault', async () => {
  await withTemp(async (parent) => {
    const root = await makeVault(parent);
    const secret = join(parent, 'secret.html');
    await writeFile(secret, 'TOP-SECRET');
    const origin = noteHtml('Origen', SOURCE_ID, '<a data-g-pending="../../secret.html">x</a>');
    await writeNote(root, 'origen.html', origin);
    await withIndex(root, async (index) => {
      const result = await promotePendingLinks({
        vaultRoot: root,
        index,
        note: {
          id: CREATED_ID,
          path: 'docs/roadmap.html',
          title: 'Roadmap',
          aliases: ['../../secret.html'],
        },
      });
      expect(result.notes).toHaveLength(1);
      const html = await readFile(join(root, 'origen.html'), 'utf8');
      expect(html).not.toContain('TOP-SECRET');
      expect(html).not.toContain('secret.html');
      expect(html).toContain('href="docs/roadmap.html"');
      expect(await readFile(secret, 'utf8')).toBe('TOP-SECRET');
      expect(index.notes()).toHaveLength(1);
      expect(index.note('origen.html')?.title).toBe('Origen');
      expect(index.search('Origen')).toHaveLength(1);

      await expect(
        promotePendingLinks({
          vaultRoot: root,
          index,
          note: { id: CREATED_ID, path: '%2e%2e/secret.html', title: 'Roadmap' },
        }),
      ).rejects.toMatchObject({ code: 'E_PATH_OUTSIDE_VAULT' });
      expect(() =>
        promotePendingAnchors({
          html: origin,
          fromPath: 'a.html',
          note: { id: CREATED_ID, path: 'notes/../../secret.html', title: 'Roadmap' },
        }),
      ).toThrow(GavetaError);
    });
  });
});

it('does not write when a later note is a symlink that leaves the vault', async () => {
  await withTemp(async (parent) => {
    const root = await makeVault(parent);
    const first = noteHtml('Uno', SOURCE_ID, '<a data-g-pending="Roadmap">uno</a>');
    const second = noteHtml('Dos', OTHER_ID, '<a data-g-pending="Roadmap">dos</a>');
    await writeNote(root, 'a/one.html', first);
    await writeNote(root, 'z/two.html', second);
    const outside = join(parent, 'outside.html');
    await writeFile(outside, 'OUTSIDE');
    await withIndex(root, async (index) => {
      await rm(join(root, 'z/two.html'));
      await symlink(outside, join(root, 'z/two.html'));
      await expect(
        promotePendingLinks({
          vaultRoot: root,
          index,
          note: { id: CREATED_ID, path: 'roadmap.html', title: 'Roadmap' },
        }),
      ).rejects.toMatchObject({ code: 'E_PATH_OUTSIDE_VAULT' });
      expect(await readFile(join(root, 'a/one.html'), 'utf8')).toBe(first);
      expect(await readFile(outside, 'utf8')).toBe('OUTSIDE');
      expect(index.links('a/one.html')[0]).toMatchObject({
        kind: 'pending',
        pendingTitle: 'Roadmap',
      });
      const temps = (await readdir(join(root, 'a'))).filter((name) => name.includes('.tmp'));
      expect(temps).toEqual([]);
    });
  });
});

it('refuses a note path that escapes through a symlink and does not write either file', async () => {
  await withTemp(async (parent) => {
    const root = await makeVault(parent);
    const outside = join(parent, 'outside');
    await mkdir(outside);
    await writeFile(join(outside, 'note.html'), 'OUTSIDE');
    await symlink(outside, join(root, 'escape'));
    const origin = noteHtml('Origen', SOURCE_ID, '<a data-g-pending="Roadmap">ver</a>');
    await writeNote(root, 'origen.html', origin);
    await withIndex(root, async (index) => {
      await expect(
        promotePendingLinks({
          vaultRoot: root,
          index,
          note: { id: CREATED_ID, path: 'escape/note.html', title: 'Roadmap' },
        }),
      ).rejects.toMatchObject({ code: 'E_PATH_OUTSIDE_VAULT' });
      expect(await readFile(join(root, 'origen.html'), 'utf8')).toBe(origin);
      expect(await readFile(join(outside, 'note.html'), 'utf8')).toBe('OUTSIDE');
    });
  });
});

it('restores the first note when the next directory rejects the atomic write', async () => {
  await withTemp(async (parent) => {
    const root = await makeVault(parent);
    const first = noteHtml('Uno', SOURCE_ID, '<a data-g-pending="Roadmap">uno</a>');
    const second = noteHtml('Dos', OTHER_ID, '<a data-g-pending="Roadmap">dos</a>');
    await writeNote(root, 'a/one.html', first);
    await writeNote(root, 'z/two.html', second);
    await withIndex(root, async (index) => {
      await chmod(join(root, 'z'), 0o555);
      try {
        await expect(
          promotePendingLinks({
            vaultRoot: root,
            index,
            note: { id: CREATED_ID, path: 'roadmap.html', title: 'Roadmap' },
          }),
        ).rejects.toMatchObject({ code: 'EACCES' });
      } finally {
        await chmod(join(root, 'z'), 0o755);
      }
      expect(await readFile(join(root, 'a/one.html'), 'utf8')).toBe(first);
      expect(await readFile(join(root, 'z/two.html'), 'utf8')).toBe(second);
      expect(index.links('a/one.html')[0]).toMatchObject({ kind: 'pending' });
      const temps = (await readdir(join(root, 'a'))).filter((name) => name.includes('.tmp'));
      expect(temps).toEqual([]);
    });
  });
});
