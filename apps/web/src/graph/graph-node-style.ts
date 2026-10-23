import type { GraphNodeView } from '../api/types.ts';
import { isTagNodeKey } from './filter-graph.ts';

export function graphNodeCssClass(node: GraphNodeView): string {
  if (isTagNodeKey(node.id ?? '')) {
    return 'graph-view__node--tag';
  }
  if (node.ghost) {
    return 'graph-view__node--ghost';
  }
  switch (node.type) {
    case 'slides':
      return 'graph-view__node--slides';
    case 'todo':
      return 'graph-view__node--todo';
    case 'dashboard':
      return 'graph-view__node--dashboard';
    case 'design':
      return 'graph-view__node--design';
    case 'artifact':
      return 'graph-view__node--artifact';
    default:
      return 'graph-view__node--doc';
  }
}

export const GRAPH_LEGEND_ITEMS: readonly { readonly className: string; readonly label: string }[] =
  [
    { className: 'graph-view__node--doc', label: 'Documento' },
    { className: 'graph-view__node--slides', label: 'Presentación' },
    { className: 'graph-view__node--todo', label: 'Tareas' },
    { className: 'graph-view__node--dashboard', label: 'Panel' },
    { className: 'graph-view__node--design', label: 'Diseño' },
    { className: 'graph-view__node--artifact', label: 'Artefacto' },
    { className: 'graph-view__node--ghost', label: 'Fantasma' },
    { className: 'graph-view__node--tag', label: 'Etiqueta' },
  ];
