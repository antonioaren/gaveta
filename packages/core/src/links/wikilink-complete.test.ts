import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { openVaultIndex } from '../sqlite/store.ts';
import { completeWikilinkTargets } from './wikilink-complete.ts';

const NOTE_A = '01JB7Z3K9QX4T5M2N8V6R0WYHC';
const NOTE_B = '01JB8A2M4R7C9D1E3F5G7H9J0K';

function noteHtml(options: {
  readonly title: string;
  readonly id?: string;
  readonly aliases?: string;
}): string {
  const head = [
    '<meta charset="utf-8">',
    `<title>${options.title}</title>`,
    `<meta name="gaveta:id" content="${options.id ?? NOTE_A}">`,
    '<meta name="gaveta:type" content="doc">',
    '<meta name="gaveta:created" content="2026-10-22T10:00:00Z">',
  ];
  if (options.aliases !== undefined) {
    head.push(`<meta name="gaveta:aliases" content="${options.aliases}">`);
  }
  return `<!doctype html><html lang="es"><head>${head.join('')}</head><body><article><h1>${options.title}</h1><p>Cuerpo</p></article></body></html>`;
}

async function withVault(run: (root: string) => Promise<void>): Promise<void> {
  const parent = await mkdtemp(join(tmpdir(), 'gaveta-wikilink-complete-'));
  const root = join(parent, 'vault');
  await mkdir(join(root, '.gaveta'), { recursive: true });
  try {
    await run(root);
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
}

describe('completeWikilinkTargets', () => {
  it('lists every note when the query is empty, sorted by path', async () => {
    await withVault(async (root) => {
      await writeFile(join(root, 'b.html'), noteHtml({ title: 'Beta', id: NOTE_B }), 'utf8');
      await writeFile(join(root, 'a.html'), noteHtml({ title: 'Alfa', id: NOTE_A }), 'utf8');
      const index = await openVaultIndex(root);
      await index.rebuild();
      const hits = completeWikilinkTargets(index, '', 10);
      expect(hits.map((hit) => hit.path)).toEqual(['a.html', 'b.html']);
      expect(hits.every((hit) => hit.matchedBy === 'title')).toBe(true);
    });
  });

  it('prefix-matches titles and aliases case- and accent-insensitively', async () => {
    await withVault(async (root) => {
      await writeFile(
        join(root, 'guia.html'),
        noteHtml({ title: 'Guía', id: NOTE_A, aliases: 'manual, Árbol' }),
        'utf8',
      );
      await writeFile(
        join(root, 'roadmap.html'),
        noteHtml({ title: 'Gaveta roadmap', id: NOTE_B }),
        'utf8',
      );
      const index = await openVaultIndex(root);
      await index.rebuild();
      expect(completeWikilinkTargets(index, 'gav', 5).map((hit) => hit.title)).toEqual([
        'Gaveta roadmap',
      ]);
      const byAlias = completeWikilinkTargets(index, 'arb', 5);
      expect(byAlias).toEqual([
        expect.objectContaining({
          title: 'Guía',
          matchedBy: 'alias',
          matchedLabel: 'Árbol',
        }),
      ]);
    });
  });

  it('fuzzy-matches near titles like suggestNotes', async () => {
    await withVault(async (root) => {
      await writeFile(
        join(root, 'guia.html'),
        noteHtml({ title: 'Gaveta roadmap', id: NOTE_A }),
        'utf8',
      );
      const index = await openVaultIndex(root);
      await index.rebuild();
      const hits = completeWikilinkTargets(index, 'Roadmap', 5);
      expect(hits).toEqual([
        expect.objectContaining({ title: 'Gaveta roadmap', matchedBy: 'title' }),
      ]);
    });
  });

  it('respects the limit and rejects invalid arguments', async () => {
    await withVault(async (root) => {
      await writeFile(join(root, 'a.html'), noteHtml({ title: 'Alfa', id: NOTE_A }), 'utf8');
      const index = await openVaultIndex(root);
      await index.rebuild();
      expect(completeWikilinkTargets(index, '', 0)).toEqual([]);
      expect(completeWikilinkTargets(index, 'zzz', 5)).toEqual([]);
    });
  });
});
