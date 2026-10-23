import type { GraphEdgeView } from '../api/types.ts';

export function buildAdjacency(edges: readonly GraphEdgeView[]): Map<string, Set<string>> {
  const adjacency = new Map<string, Set<string>>();
  for (const edge of edges) {
    let fromSet = adjacency.get(edge.from);
    if (fromSet === undefined) {
      fromSet = new Set();
      adjacency.set(edge.from, fromSet);
    }
    fromSet.add(edge.to);
    let toSet = adjacency.get(edge.to);
    if (toSet === undefined) {
      toSet = new Set();
      adjacency.set(edge.to, toSet);
    }
    toSet.add(edge.from);
  }
  return adjacency;
}

export function neighborKeys(adjacency: Map<string, Set<string>>, key: string): Set<string> {
  const neighbors = adjacency.get(key);
  if (neighbors === undefined) {
    return new Set();
  }
  return new Set([key, ...neighbors]);
}
