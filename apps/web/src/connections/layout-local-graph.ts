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

/** Lightweight force layout for small local graphs (no external deps). */
export function layoutLocalGraph(
  nodes: readonly ForceLayoutNode[],
  edges: readonly ForceLayoutEdge[],
  width: number,
  height: number,
  iterations = 48,
): Map<string, ForceLayoutPosition> {
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
    const repulsion = 1200;
    const attraction = 0.04;
    const damping = 0.85;
    for (const left of nodes) {
      const a = positions.get(left.key);
      if (a === undefined) {
        continue;
      }
      for (const right of nodes) {
        if (left.key === right.key) {
          continue;
        }
        const b = positions.get(right.key);
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
      p.x = Math.max(16, Math.min(width - 16, p.x));
      p.y = Math.max(16, Math.min(height - 16, p.y));
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
