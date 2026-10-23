import { expect, it } from 'vitest';
import type { GraphNodeView } from '../api/types.ts';
import { applyClientGraphFilters, buildGraphApiPath, collectFolders } from './filter-graph.ts';

const sampleNode = (partial: Partial<GraphNodeView> & { title: string }): GraphNodeView => ({
  id: partial.id ?? '01ARZ3NDEKTSV4RRFFQ69G5FAV',
  title: partial.title,
  type: partial.type ?? 'doc',
  tags: partial.tags ?? [],
  path: partial.path ?? 'a.html',
  ghost: partial.ghost ?? false,
});

it('builds graph API query from server filters', () => {
  expect(
    buildGraphApiPath({
      type: 'doc',
      tag: 'alpha',
      rel: 'related',
      folder: 'enlaces',
      hideOrphans: false,
      showTagNodes: false,
    }),
  ).toBe('/api/graph?type=doc&tag=alpha&rel=related&folder=enlaces');
});

it('collects folder prefixes from note paths', () => {
  const folders = collectFolders([
    sampleNode({ title: 'A', path: 'enlaces/a.html' }),
    sampleNode({ title: 'B', path: 'enlaces/mas/b.html' }),
  ]);
  expect(folders).toEqual(['enlaces', 'enlaces/mas']);
});

it('hides orphan notes but keeps ghosts', () => {
  const nodes = [
    sampleNode({ title: 'Huérfana', path: 'huerfana.html', id: '01HUER0000000000000000001' }),
    sampleNode({ title: 'Par', path: 'par.html', id: '01PAR00000000000000000002' }),
    sampleNode({ title: 'Fantasma', path: null, id: null, ghost: true }),
  ];
  const edges = [{ from: 'par.html', to: 'otra.html', rel: null }];
  const key = (node: GraphNodeView) => node.path ?? `ghost:${node.title}`;
  const filtered = applyClientGraphFilters({ nodes, edges }, key, {
    hideOrphans: true,
    showTagNodes: false,
  });
  expect(filtered.nodes.map((node) => node.title).sort()).toEqual(['Fantasma', 'Par']);
});
