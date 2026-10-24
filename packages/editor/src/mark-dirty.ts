import type { JSONContent } from '@tiptap/core';

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}

function blockHasPreservedOuter(node: JSONContent): boolean {
  if (!isRecord(node.attrs)) {
    return false;
  }
  return typeof node.attrs.gavetaOuter === 'string';
}

function markNodeDirty(node: JSONContent): JSONContent {
  if (!blockHasPreservedOuter(node)) {
    return node;
  }
  const attrs = { ...(node.attrs ?? {}), gavetaDirty: true, gavetaOuter: null };
  const next: JSONContent = { ...node, attrs };
  if (node.content !== undefined) {
    next.content = node.content.map((child) => markNodeDirty(child));
  }
  return next;
}

/** Mark top-level block indices dirty (used when the visual editor changes content). */
export function markDirtyBlocksInJson(
  doc: JSONContent,
  blockIndices: ReadonlySet<number>,
): JSONContent {
  if (doc.content === undefined) {
    return doc;
  }
  return {
    ...doc,
    content: doc.content.map((node, index) => {
      if (!blockIndices.has(index)) {
        return node;
      }
      return markNodeDirty(node);
    }),
  };
}
