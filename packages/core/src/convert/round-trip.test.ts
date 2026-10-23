import { describe, expect, it } from 'vitest';
import {
  listLossyMarkdownFixtureNotes,
  listMdastEquivalentFixturePaths,
  roundTripMarkdownFixture,
  roundTripMarkdownSource,
  warningCodes,
  withMarkdownImportVault,
  roundTripHtmlNoteInVault,
  noteSemanticSnapshot,
} from './round-trip.ts';

describe('markdown round-trip (REQ-MIG-11)', () => {
  it('keeps mdast-equivalent bodies for the supported fixture subset', () => {
    const paths = listMdastEquivalentFixturePaths();
    expect(paths.length).toBeGreaterThan(40);
    for (const relativePath of paths) {
      const result = roundTripMarkdownFixture(relativePath);
      expect(result.mdastEquivalent, relativePath).toBe(true);
    }
  });

  it('documents lossy fixture notes with explicit import/export warnings when required', () => {
    for (const entry of listLossyMarkdownFixtureNotes()) {
      const result = roundTripMarkdownFixture(entry.path);
      expect(result.mdastEquivalent, entry.path).toBe(false);
      for (const code of entry.requireImportWarnings ?? []) {
        expect(warningCodes(result.importWarnings), entry.path).toContain(code);
      }
      for (const code of entry.requireExportWarnings ?? []) {
        expect(warningCodes(result.exportWarnings), entry.path).toContain(code);
      }
    }
  });

  it('preserves note semantics on html → md → html for imported corpus notes', async () => {
    await withMarkdownImportVault(async (vaultRoot) => {
      const snapshots = await roundTripHtmlNoteInVault({
        vaultRoot,
        notePath: 'corpus/grupo-a/nota-001.html',
        markdownRelativePath: 'corpus/grupo-a/nota-001.md',
      });
      expect(snapshots.after.id).toBe(snapshots.before.id);
      expect(snapshots.after.title).toBe(snapshots.before.title);
      expect(snapshots.after.tags).toEqual(snapshots.before.tags);
      expect(snapshots.after.tasks).toEqual(snapshots.before.tasks);
    });
  });

  it('flags wikilink embeds as lossy on import', () => {
    const source = '![[pixel.png]]\n';
    const result = roundTripMarkdownSource(source, 'contenido/imagenes.md');
    expect(result.mdastEquivalent).toBe(false);
    expect(warningCodes(result.importWarnings)).toContain('W_IMPORT_UNSUPPORTED');
  });
});

describe('noteSemanticSnapshot', () => {
  it('extracts id, title, tags, tasks, and links', () => {
    const html = `<!doctype html><html lang="es"><head>
<meta charset="utf-8"><title>T</title>
<meta name="gaveta:id" content="01JB7Z3K9QX4T5M2N8V6R0WYHC">
<meta name="gaveta:type" content="doc">
<meta name="gaveta:created" content="2026-10-22T10:00:00Z">
<meta name="gaveta:tags" content="a, b">
</head><body><article><h1>T</h1>
<ul><li data-g-task>One</li></ul>
<p><a data-g-pending="Ghost">Ghost</a></p>
</article></body></html>`;
    const snapshot = noteSemanticSnapshot(html);
    expect(snapshot.id).toBe('01JB7Z3K9QX4T5M2N8V6R0WYHC');
    expect(snapshot.title).toBe('T');
    expect(snapshot.tags).toEqual(['a', 'b']);
    expect(snapshot.tasks).toEqual([{ text: 'One', checked: false }]);
    expect(snapshot.links[0]?.kind).toBe('pending');
  });
});
