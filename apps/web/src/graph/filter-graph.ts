import type { GraphEdgeView, GraphNodeView } from '../api/types.ts';
import { graphNodeKey } from '../connections/graph-ref.ts';
import { splitNotePath } from '../explorer/build-tree.ts';

export interface GraphFilterState {
  readonly type: string | null;
  readonly tag: string | null;
  readonly rel: string | null;
  readonly folder: string | null;
  readonly hideOrphans: boolean;
  readonly showTagNodes: boolean;
}

export interface GraphView {
  readonly nodes: readonly GraphNodeView[];
  readonly edges: readonly GraphEdgeView[];
}

export function buildGraphApiPath(filters: GraphFilterState): string {
  const params = new URLSearchParams();
  if (filters.type !== null && filters.type.length > 0) {
    params.set('type', filters.type);
  }
  if (filters.tag !== null && filters.tag.length > 0) {
    params.set('tag', filters.tag);
  }
  if (filters.rel !== null && filters.rel.length > 0) {
    params.set('rel', filters.rel);
  }
  if (filters.folder !== null && filters.folder.length > 0) {
    params.set('folder', filters.folder);
  }
  const query = params.toString();
  return query.length === 0 ? '/api/graph' : `/api/graph?${query}`;
}

export function nodeDegree(
  keys: readonly string[],
  edges: readonly GraphEdgeView[],
): Map<string, number> {
  const degree = new Map<string, number>();
  for (const key of keys) {
    degree.set(key, 0);
  }
  for (const edge of edges) {
    degree.set(edge.from, (degree.get(edge.from) ?? 0) + 1);
    degree.set(edge.to, (degree.get(edge.to) ?? 0) + 1);
  }
  return degree;
}

export function collectFolders(nodes: readonly GraphNodeView[]): string[] {
  const folders = new Set<string>();
  for (const node of nodes) {
    if (node.path === null || node.path.length === 0) {
      continue;
    }
    const { folder } = splitNotePath(node.path);
    if (folder.length === 0) {
      continue;
    }
    const segments = folder.split('/');
    let built = '';
    for (const segment of segments) {
      built = built.length === 0 ? segment : `${built}/${segment}`;
      folders.add(built);
    }
  }
  return [...folders].sort((left, right) => left.localeCompare(right, 'es'));
}

export function collectTags(nodes: readonly GraphNodeView[]): string[] {
  const tags = new Set<string>();
  for (const node of nodes) {
    for (const tag of node.tags) {
      tags.add(tag);
    }
  }
  return [...tags].sort((left, right) => left.localeCompare(right, 'es'));
}

export function collectRels(edges: readonly GraphEdgeView[]): string[] {
  const rels = new Set<string>();
  for (const edge of edges) {
    if (edge.rel !== null && edge.rel.length > 0) {
      rels.add(edge.rel);
    }
  }
  return [...rels].sort((left, right) => left.localeCompare(right, 'es'));
}

const TAG_NODE_PREFIX = 'tag:';

export function isTagNodeKey(key: string): boolean {
  return key.startsWith(TAG_NODE_PREFIX);
}

export function augmentWithTagNodes(view: GraphView): GraphView {
  const extraNodes: GraphNodeView[] = [];
  const extraEdges: GraphEdgeView[] = [];
  const tags = collectTags(view.nodes);
  for (const tag of tags) {
    const key = `${TAG_NODE_PREFIX}${tag}`;
    extraNodes.push({
      id: key,
      title: tag,
      type: 'doc',
      tags: [tag],
      path: null,
      ghost: false,
    });
    for (const node of view.nodes) {
      if (node.tags.includes(tag)) {
        extraEdges.push({ from: graphNodeKey(node), to: key, rel: 'tag' });
      }
    }
  }
  return {
    nodes: [...view.nodes, ...extraNodes],
    edges: [...view.edges, ...extraEdges],
  };
}

export function applyClientGraphFilters(
  view: GraphView,
  nodeKeys: (node: GraphNodeView) => string,
  filters: Pick<GraphFilterState, 'hideOrphans' | 'showTagNodes'>,
): GraphView {
  const working = filters.showTagNodes ? augmentWithTagNodes(view) : view;
  if (!filters.hideOrphans) {
    return working;
  }
  const keys = working.nodes.map((node) => nodeKeys(node));
  const degree = nodeDegree(keys, working.edges);
  const keep = new Set(
    working.nodes
      .filter((node) => {
        const key = nodeKeys(node);
        return (degree.get(key) ?? 0) > 0 || node.ghost;
      })
      .map((node) => nodeKeys(node)),
  );
  return {
    nodes: working.nodes.filter((node) => keep.has(nodeKeys(node))),
    edges: working.edges.filter((edge) => keep.has(edge.from) && keep.has(edge.to)),
  };
}
