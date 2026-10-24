import { BODY_ELEMENTS } from '@gaveta/core';
import type { Extensions } from '@tiptap/core';
import { Mark, Node } from '@tiptap/core';
import { blockContentExpression } from './content-model.ts';
import { INLINE_ATOM_TAGS, MARK_TAGS, VOID_BLOCK_TAGS } from './element-kind.ts';
import { HtmlBlockExtension } from './html-block.ts';
import { tagToNodeName } from './names.ts';

const GAVETA_ATTRS = {
  gavetaAttrs: { default: {} },
};

const BLOCK_NODE_ATTRS = {
  ...GAVETA_ATTRS,
  gavetaOuter: { default: null },
  gavetaDirty: { default: false },
};

function createMarkExtension(tag: string): Mark {
  const name = tagToNodeName(tag);
  return Mark.create({
    name,
    inclusive: true,
    addAttributes() {
      return GAVETA_ATTRS;
    },
    parseHTML: () => [{ tag }],
    renderHTML: ({ HTMLAttributes }) => [tag, HTMLAttributes, 0],
  });
}

function createNodeExtension(tag: string): Node {
  const name = tagToNodeName(tag);
  const isInlineAtom = INLINE_ATOM_TAGS.has(tag);
  const isVoid = VOID_BLOCK_TAGS.has(tag);

  return Node.create({
    name,
    group: isInlineAtom ? 'inline' : 'block',
    inline: isInlineAtom,
    atom: isInlineAtom || isVoid || tag === 'iframe' || tag === 'gaveta-embed',
    content:
      isVoid || tag === 'iframe' || tag === 'gaveta-embed'
        ? undefined
        : blockContentExpression(tag),
    addAttributes() {
      return tag === 'li'
        ? { ...BLOCK_NODE_ATTRS, gavetaInlineLi: { default: false } }
        : BLOCK_NODE_ATTRS;
    },
    parseHTML: () => [{ tag }],
    renderHTML: ({ HTMLAttributes }) => [tag, HTMLAttributes, 0],
  });
}

function createCodeNodeExtension(): Node {
  return Node.create({
    name: tagToNodeName('code'),
    group: 'inline',
    inline: true,
    content: 'inline*',
    addAttributes() {
      return GAVETA_ATTRS;
    },
    parseHTML: () => [{ tag: 'code' }],
    renderHTML: ({ HTMLAttributes }) => ['code', HTMLAttributes, 0],
  });
}

export function buildGavetaExtensions(): Extensions {
  const extensions: Extensions = [
    Node.create({
      name: 'doc',
      topNode: true,
      content: 'block+',
    }),
    HtmlBlockExtension,
  ];

  for (const entry of BODY_ELEMENTS) {
    const tag = entry.name;
    if (tag === 'code') {
      extensions.push(createCodeNodeExtension());
      continue;
    }
    if (MARK_TAGS.has(tag)) {
      extensions.push(createMarkExtension(tag));
      continue;
    }
    extensions.push(createNodeExtension(tag));
  }

  return extensions;
}

export const gavetaExtensions = buildGavetaExtensions();

/** Contract body tags mapped to TipTap schema names (plus htmlBlock and doc). */
export function mappedContractTags(): ReadonlyMap<string, string> {
  const map = new Map<string, string>();
  map.set('doc', 'doc');
  map.set('htmlBlock', 'htmlBlock');
  for (const entry of BODY_ELEMENTS) {
    map.set(entry.name, tagToNodeName(entry.name));
  }
  return map;
}
