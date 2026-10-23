export interface ForceLayoutNode {
  readonly key: string;
}

export interface ForceLayoutEdge {
  readonly from: string;
  readonly to: string;
}

export interface ForceLayoutPosition {
  readonly x: number;
  readonly y: number;
}

export interface ForceLayoutOptions {
  readonly width: number;
  readonly height: number;
  readonly maxIterations?: number;
}

const DEFAULT_MAX_ITERATIONS = 48;
const LARGE_GRAPH_NODE_THRESHOLD = 120;
const LARGE_GRAPH_MAX_ITERATIONS = 24;
const REPULSION_SAMPLE_SIZE = 32;

/** Cap iterations for large graphs (~1000 nodes) so layout stays bounded. */
export function resolveLayoutIterations(nodeCount: number, requested?: number): number {
  if (requested !== undefined) {
    return Math.max(1, Math.min(requested, 64));
  }
  if (nodeCount > LARGE_GRAPH_NODE_THRESHOLD) {
    return LARGE_GRAPH_MAX_ITERATIONS;
  }
  return DEFAULT_MAX_ITERATIONS;
}

function sampleKeys(keys: readonly string[], self: string, count: number): string[] {
  if (keys.length <= count + 1) {
    return keys.filter((key) => key !== self);
  }
  const picked = new Set<string>();
  while (picked.size < count) {
    const index = Math.floor(Math.random() * keys.length);
    const candidate = keys[index];
    if (candidate !== undefined && candidate !== self) {
      picked.add(candidate);
    }
  }
  return [...picked];
}

/** Lightweight force layout (no external deps). Safe for worker threads. */
export function computeForceLayout(
  nodes: readonly ForceLayoutNode[],
  edges: readonly ForceLayoutEdge[],
  options: ForceLayoutOptions,
): Map<string, ForceLayoutPosition> {
  const { width, height } = options;
  const iterations = resolveLayoutIterations(nodes.length, options.maxIterations);
  const keys = nodes.map((node) => node.key);
  const useSampling = nodes.length > LARGE_GRAPH_NODE_THRESHOLD;

  const positions = new Map<string, { x: number; y: number; vx: number; vy: number }>();
  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.min(width, height) * 0.35;
  let angle = 0;
  const step = nodes.length > 0 ? (Math.PI * 2) / nodes.length : 0;
  for (const node of nodes) {
    positions.set(node.key, {
      x: cx + radius * Math.cos(angle),
      y: cy + radius * Math.sin(angle),
      vx: 0,
      vy: 0,
    });
    angle += step;
  }

  for (let iter = 0; iter < iterations; iter += 1) {
    const repulsion = useSampling ? 900 : 1200;
    const attraction = 0.04;
    const damping = 0.85;
    for (const left of nodes) {
      const a = positions.get(left.key);
      if (a === undefined) {
        continue;
      }
      const others = useSampling
        ? sampleKeys(keys, left.key, REPULSION_SAMPLE_SIZE)
        : keys.filter((key) => key !== left.key);
      for (const rightKey of others) {
        const b = positions.get(rightKey);
        if (b === undefined) {
          continue;
        }
        let dx = a.x - b.x;
        let dy = a.y - b.y;
        const distSq = dx * dx + dy * dy + 0.01;
        const force = repulsion / distSq;
        const dist = Math.sqrt(distSq);
        dx = (dx / dist) * force;
        dy = (dy / dist) * force;
        a.vx += dx;
        a.vy += dy;
      }
    }
    for (const edge of edges) {
      const a = positions.get(edge.from);
      const b = positions.get(edge.to);
      if (a === undefined || b === undefined) {
        continue;
      }
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      a.vx += dx * attraction;
      a.vy += dy * attraction;
      b.vx -= dx * attraction;
      b.vy -= dy * attraction;
    }
    for (const node of nodes) {
      const p = positions.get(node.key);
      if (p === undefined) {
        continue;
      }
      p.vx += (cx - p.x) * 0.01;
      p.vy += (cy - p.y) * 0.01;
      p.vx *= damping;
      p.vy *= damping;
      p.x += p.vx;
      p.y += p.vy;
      const margin = 16;
      p.x = Math.max(margin, Math.min(width - margin, p.x));
      p.y = Math.max(margin, Math.min(height - margin, p.y));
    }
  }

  const result = new Map<string, ForceLayoutPosition>();
  for (const node of nodes) {
    const p = positions.get(node.key);
    if (p !== undefined) {
      result.set(node.key, { x: p.x, y: p.y });
    }
  }
  return result;
}
