import { expect, it } from 'vitest';
import { layoutLocalGraph } from './layout-local-graph.ts';

it('places every node inside the viewport', () => {
  const nodes = [{ key: 'a' }, { key: 'b' }, { key: 'c' }];
  const edges = [
    { from: 'a', to: 'b' },
    { from: 'b', to: 'c' },
  ];
  const layout = layoutLocalGraph(nodes, edges, 200, 160, 30);
  for (const node of nodes) {
    const pos = layout.get(node.key);
    expect(pos).toBeDefined();
    expect(pos?.x).toBeGreaterThanOrEqual(16);
    expect(pos?.x).toBeLessThanOrEqual(184);
    expect(pos?.y).toBeGreaterThanOrEqual(16);
    expect(pos?.y).toBeLessThanOrEqual(144);
  }
});
