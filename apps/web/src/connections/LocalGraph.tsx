import { useMemo } from 'react';
import type { GraphEdgeView, GraphNodeView } from '../api/types.ts';
import { graphNodeKey, viewerRefForGraphNode } from './graph-ref.ts';
import { layoutLocalGraph } from './layout-local-graph.ts';
import { useI18n } from '../i18n/useI18n.ts';

const WIDTH = 240;
const HEIGHT = 180;

function nodeTypeClass(type: GraphNodeView['type'], ghost: boolean): string {
  if (ghost) {
    return 'connections-graph__node--ghost';
  }
  switch (type) {
    case 'slides':
      return 'connections-graph__node--slides';
    case 'todo':
      return 'connections-graph__node--todo';
    case 'dashboard':
      return 'connections-graph__node--dashboard';
    case 'design':
      return 'connections-graph__node--design';
    case 'artifact':
      return 'connections-graph__node--artifact';
    default:
      return 'connections-graph__node--doc';
  }
}

interface LocalGraphProps {
  readonly nodes: readonly GraphNodeView[];
  readonly edges: readonly GraphEdgeView[];
  readonly centerRef: string | null;
  readonly onNavigate: (ref: string, title: string, path: string, noteId: string | null) => void;
}

export function LocalGraph({ nodes, edges, centerRef, onNavigate }: LocalGraphProps) {
  const { t } = useI18n();
  const layout = useMemo(() => {
    const layoutNodes = nodes.map((node) => ({ key: graphNodeKey(node) }));
    const layoutEdges = edges.map((edge) => ({ from: edge.from, to: edge.to }));
    return layoutLocalGraph(layoutNodes, layoutEdges, WIDTH, HEIGHT);
  }, [nodes, edges]);

  if (nodes.length === 0) {
    return <p className="connections__empty">{t('web.connections.graph.emptyNodes')}</p>;
  }

  return (
    <svg
      className="connections-graph"
      viewBox={`0 0 ${String(WIDTH)} ${String(HEIGHT)}`}
      role="img"
      aria-label={t('web.connections.graph.aria')}
    >
      {edges.map((edge, index) => {
        const from = layout.get(edge.from);
        const to = layout.get(edge.to);
        if (from === undefined || to === undefined) {
          return null;
        }
        return (
          <line
            key={`${edge.from}-${edge.to}-${String(index)}`}
            className="connections-graph__edge"
            x1={from.x}
            y1={from.y}
            x2={to.x}
            y2={to.y}
          />
        );
      })}
      {nodes.map((node) => {
        const key = graphNodeKey(node);
        const pos = layout.get(key);
        if (pos === undefined) {
          return null;
        }
        const ref = viewerRefForGraphNode(node);
        const isCenter = centerRef !== null && (node.id === centerRef || node.path === centerRef);
        const label = node.title.length > 0 ? node.title : key;
        return (
          <g key={key} className="connections-graph__node-group">
            <circle
              className={`connections-graph__node ${nodeTypeClass(node.type, node.ghost)}${isCenter ? ' connections-graph__node--center' : ''}`}
              cx={pos.x}
              cy={pos.y}
              r={isCenter ? 9 : 7}
              tabIndex={ref === null ? -1 : 0}
              role="button"
              aria-label={label}
              onClick={() => {
                if (ref === null) {
                  return;
                }
                const noteId = node.id !== null && node.id.length > 0 ? node.id : null;
                onNavigate(ref, node.title, node.path ?? ref, noteId);
              }}
              onKeyDown={(event) => {
                if (ref === null) {
                  return;
                }
                if (event.key !== 'Enter' && event.key !== ' ') {
                  return;
                }
                event.preventDefault();
                const noteId = node.id !== null && node.id.length > 0 ? node.id : null;
                onNavigate(ref, node.title, node.path ?? ref, noteId);
              }}
            />
            <title>{label}</title>
          </g>
        );
      })}
    </svg>
  );
}
