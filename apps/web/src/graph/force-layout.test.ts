import { expect, it } from 'vitest';
import { computeForceLayout, resolveLayoutIterations } from './force-layout.ts';

it('caps iterations for large graphs', () => {
  expect(resolveLayoutIterations(50)).toBe(48);
  expect(resolveLayoutIterations(500)).toBe(24);
  expect(resolveLayoutIterations(500, 10)).toBe(10);
});

it('places every node inside the viewport', () => {
  const nodes = [{ key: 'a' }, { key: 'b' }, { key: 'c' }];
  const edges = [
    { from: 'a', to: 'b' },
    { from: 'b', to: 'c' },
  ];
  const layout = computeForceLayout(nodes, edges, { width: 200, height: 160, maxIterations: 30 });
  for (const node of nodes) {
    const pos = layout.get(node.key);
    expect(pos).toBeDefined();
    expect(pos?.x).toBeGreaterThanOrEqual(16);
    expect(pos?.x).toBeLessThanOrEqual(184);
    expect(pos?.y).toBeGreaterThanOrEqual(16);
    expect(pos?.y).toBeLessThanOrEqual(144);
  }
});

it('completes layout for many nodes within iteration cap', () => {
  const count = 200;
  const nodes = Array.from({ length: count }, (_, index) => ({ key: `n${String(index)}` }));
  const edges = [{ from: 'n0', to: 'n1' }];
  const layout = computeForceLayout(nodes, edges, { width: 800, height: 600 });
  expect(layout.size).toBe(count);
});
