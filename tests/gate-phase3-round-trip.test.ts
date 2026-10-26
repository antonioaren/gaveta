import { describe, expect, it } from 'vitest';
import {
  assertMaliciousSanitized,
  isMaliciousCorpus,
  listPhase3Gate1MarkdownNotes,
  listPhase3StaticFixtureNotes,
  runPhase3RoundTripPipeline,
} from '@gaveta/core';
import { editorJsonToNoteHtml, noteHtmlToEditorJson } from '@gaveta/editor';

const visualEditor = {
  noteHtmlToEditorJson,
  editorJsonToNoteHtml,
};

describe('phase 3 gate fixture discovery', () => {
  it('lists every static fixtures/*.html note automatically', () => {
    const notes = listPhase3StaticFixtureNotes();
    expect(notes.length).toBeGreaterThan(55);
    expect(notes.some((n) => n.corpus === 'vaults/malicious' && n.path === 'script.html')).toBe(
      true,
    );
  });

  it('includes gate-1 markdown import corpus', async () => {
    const notes = await listPhase3Gate1MarkdownNotes();
    expect(notes.length).toBeGreaterThan(40);
  });
});

describe('phase 3 round-trip (T3.9)', () => {
  const staticNotes = listPhase3StaticFixtureNotes();

  it.each(staticNotes.map((n) => [n.corpus, n.path, n.html] as const))(
    '%s/%s: visual + code save preserves semantics',
    (corpus, path, html) => {
      const { failures, html: result } = runPhase3RoundTripPipeline(
        html,
        path,
        visualEditor,
        corpus,
      );
      expect(failures, `${corpus}/${path}`).toEqual([]);
      if (isMaliciousCorpus(corpus)) {
        expect(result).not.toBeNull();
        const sanitizeError = assertMaliciousSanitized(result ?? '', path);
        expect(sanitizeError, `${corpus}/${path}`).toBeNull();
      }
    },
  );

  it('gate-1 markdown import notes round-trip', async () => {
    const notes = await listPhase3Gate1MarkdownNotes();
    const failures: { corpus: string; path: string; stage: string; detail: string }[] = [];
    for (const note of notes) {
      const result = runPhase3RoundTripPipeline(note.html, note.path, visualEditor, note.corpus);
      failures.push(...result.failures);
    }
    expect(failures).toEqual([]);
  });
});
