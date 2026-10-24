import { describe, expect, it } from 'vitest';
import { editorJsonToNoteHtml, noteHtmlToEditorJson } from './index.ts';
import { markDirtyBlocksInJson } from './mark-dirty.ts';

const SAMPLE = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>T</title><meta name="gaveta:id" content="01JB7Z3K9QX4T5M2N8V6R0WYHE"><meta name="gaveta:type" content="doc"><meta name="gaveta:created" content="2026-10-22T12:00:00.000Z"></head><body><article><h1 id="titulo">Título</h1><p id="p1">Hola</p></article></body></html>`;

function articleChild(doc: ReturnType<typeof noteHtmlToEditorJson>, index: number) {
  const article = doc.body.content?.[0];
  return article?.content?.[index];
}

describe('markDirtyBlocksInJson', () => {
  it('clears gavetaOuter and sets gavetaDirty on touched blocks', () => {
    const doc = noteHtmlToEditorJson(SAMPLE);
    const paragraph = articleChild(doc, 1);
    expect(paragraph?.type).toBe('p');
    expect(paragraph?.attrs?.gavetaOuter).toBeTypeOf('string');

    const article = doc.body.content?.[0];
    const dirtyArticle = markDirtyBlocksInJson(article ?? { type: 'article' }, new Set([1]));
    const dirtyParagraph = dirtyArticle.content?.[1];
    expect(dirtyParagraph?.attrs?.gavetaDirty).toBe(true);
    expect(dirtyParagraph?.attrs?.gavetaOuter).toBeNull();
  });

  it('re-serializes edited paragraph from structure while head bytes stay fixed', () => {
    const shell = noteHtmlToEditorJson(SAMPLE);
    const article = shell.body.content?.[0] ?? { type: 'article' };
    const dirtyArticle = markDirtyBlocksInJson(article, new Set([1]));
    const editedArticle = {
      ...dirtyArticle,
      attrs: { ...dirtyArticle.attrs, gavetaDirty: true, gavetaOuter: null },
      content: (dirtyArticle.content ?? []).map((node, index) => {
        if (index !== 1 || node.type !== 'p') {
          return node;
        }
        return {
          ...node,
          attrs: { ...node.attrs, gavetaDirty: true, gavetaOuter: null },
          content: [{ type: 'text', text: 'Mundo' }],
        };
      }),
    };
    const edited = {
      ...shell.body,
      content: [editedArticle],
    };
    const html = editorJsonToNoteHtml({ ...shell, body: edited });
    expect(html).toContain('<p id="p1">Mundo</p>');
    expect(html).toContain('<meta name="gaveta:id"');
    expect(html).not.toContain('Hola');
  });
});
