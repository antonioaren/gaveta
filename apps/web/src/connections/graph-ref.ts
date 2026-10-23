import type { GraphNodeView } from '../api/types.ts';
import { isNoteUlid } from '../notes/viewer-ref.ts';

/** Router ref for a graph node: prefer indexed ULID, then vault path, then ghost title. */
export function viewerRefForGraphNode(node: GraphNodeView): string | null {
  if (node.id !== null && isNoteUlid(node.id)) {
    return node.id;
  }
  if (node.path !== null && node.path.length > 0) {
    return node.path;
  }
  if (node.ghost && node.title.length > 0) {
    return node.title;
  }
  return null;
}

export function graphNodeKey(node: GraphNodeView): string {
  if (node.path !== null && node.path.length > 0) {
    return node.path;
  }
  if (node.ghost) {
    return `ghost:${node.title}`;
  }
  return node.id ?? node.title;
}
