import {
  computeForceLayout,
  type ForceLayoutEdge,
  type ForceLayoutNode,
  type ForceLayoutPosition,
} from '../graph/force-layout.ts';

export type { ForceLayoutEdge, ForceLayoutNode, ForceLayoutPosition };

/** Lightweight force layout for small local graphs (no external deps). */
export function layoutLocalGraph(
  nodes: readonly ForceLayoutNode[],
  edges: readonly ForceLayoutEdge[],
  width: number,
  height: number,
  iterations = 48,
): Map<string, ForceLayoutPosition> {
  return computeForceLayout(nodes, edges, { width, height, maxIterations: iterations });
}
