import { expect, it } from 'vitest';
import { graphNodeKey, viewerRefForGraphNode } from './graph-ref.ts';
import type { GraphNodeView } from '../api/types.ts';

const note: GraphNodeView = {
  id: '01M5HGV8800000000000000002',
  title: 'Destino',
  type: 'doc',
  tags: [],
  path: 'destino-enlace.html',
  ghost: false,
};

it('prefers ULID for graph navigation', () => {
  expect(viewerRefForGraphNode(note)).toBe('01M5HGV8800000000000000002');
  expect(graphNodeKey(note)).toBe('destino-enlace.html');
});

it('falls back to title for ghost nodes', () => {
  const ghost: GraphNodeView = {
    id: null,
    title: 'Fantasma',
    type: null,
    tags: [],
    path: null,
    ghost: true,
  };
  expect(viewerRefForGraphNode(ghost)).toBe('Fantasma');
  expect(graphNodeKey(ghost)).toBe('ghost:Fantasma');
});
