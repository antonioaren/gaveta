import type { MessageKey } from '@gaveta/i18n';
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

export const GRAPH_LEGEND_ENTRIES: readonly {
  readonly className: string;
  readonly labelKey: MessageKey;
}[] = [
  { className: 'graph-view__node--doc', labelKey: 'web.graph.legend.doc' },
  { className: 'graph-view__node--slides', labelKey: 'web.graph.legend.slides' },
  { className: 'graph-view__node--todo', labelKey: 'web.graph.legend.todo' },
  { className: 'graph-view__node--dashboard', labelKey: 'web.graph.legend.dashboard' },
  { className: 'graph-view__node--design', labelKey: 'web.graph.legend.design' },
  { className: 'graph-view__node--artifact', labelKey: 'web.graph.legend.artifact' },
  { className: 'graph-view__node--ghost', labelKey: 'web.graph.legend.ghost' },
  { className: 'graph-view__node--tag', labelKey: 'web.graph.legend.tag' },
];
