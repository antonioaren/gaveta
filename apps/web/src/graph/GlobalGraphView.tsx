import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { GraphNodeView } from '../api/types.ts';
import { graphNodeKey, viewerRefForGraphNode } from '../connections/graph-ref.ts';
import { isNoteUlid } from '../notes/viewer-ref.ts';
import { useTabs } from '../tabs/useTabs.ts';
import { buildAdjacency, neighborKeys } from './adjacency.ts';
import {
  applyClientGraphFilters,
  collectFolders,
  collectRels,
  collectTags,
  isTagNodeKey,
  type GraphFilterState,
} from './filter-graph.ts';
import { useNewNoteDialog } from '../new-note/useNewNoteDialog.ts';
import { ghostCreateCommand } from './ghost-create-command.ts';
import { useI18n } from '../i18n/useI18n.ts';
import { noteTypeMessageKey } from '../i18n/note-type-label.ts';
import type { CreateNoteType } from '../new-note/note-types.ts';
import { GRAPH_LEGEND_ENTRIES, graphNodeCssClass } from './graph-node-style.ts';
import { useForceLayout } from './useForceLayout.ts';
import { useGlobalGraph } from './useGlobalGraph.ts';

const LAYOUT_WIDTH = 1200;
const LAYOUT_HEIGHT = 800;

const FILTER_TYPES: readonly CreateNoteType[] = ['doc', 'slides', 'todo'];

function emptyFilters(): GraphFilterState {
  return {
    type: null,
    tag: null,
    rel: null,
    folder: null,
    hideOrphans: false,
    showTagNodes: false,
  };
}

export function GlobalGraphView() {
  const { t } = useI18n();
  const [filters, setFilters] = useState<GraphFilterState>(emptyFilters);
  const { graph, loading, error } = useGlobalGraph(filters);
  const tabState = useTabs();
  const { openNewNote } = useNewNoteDialog();
  const navigate = useNavigate();
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);
  const [selectedGhost, setSelectedGhost] = useState<GraphNodeView | null>(null);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const dragRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);

  const rawView = useMemo(() => {
    if (graph === null) {
      return { nodes: [], edges: [] };
    }
    return { nodes: graph.nodes, edges: graph.edges };
  }, [graph]);

  const folderOptions = useMemo(() => collectFolders(rawView.nodes), [rawView.nodes]);
  const tagOptions = useMemo(() => collectTags(rawView.nodes), [rawView.nodes]);
  const relOptions = useMemo(() => collectRels(rawView.edges), [rawView.edges]);

  const view = useMemo(
    () =>
      applyClientGraphFilters(rawView, graphNodeKey, {
        hideOrphans: filters.hideOrphans,
        showTagNodes: filters.showTagNodes,
      }),
    [rawView, filters.hideOrphans, filters.showTagNodes],
  );

  const layoutNodes = useMemo(
    () => view.nodes.map((node) => ({ key: graphNodeKey(node) })),
    [view.nodes],
  );
  const layoutEdges = useMemo(
    () => view.edges.map((edge) => ({ from: edge.from, to: edge.to })),
    [view.edges],
  );

  const { layout, computing } = useForceLayout(
    layoutNodes,
    layoutEdges,
    LAYOUT_WIDTH,
    LAYOUT_HEIGHT,
  );
  const adjacency = useMemo(() => buildAdjacency(view.edges), [view.edges]);
  const highlight = useMemo(() => {
    if (hoveredKey === null) {
      return null;
    }
    return neighborKeys(adjacency, hoveredKey);
  }, [adjacency, hoveredKey]);

  const showLabels = view.nodes.length <= 80;

  const openNote = (node: GraphNodeView) => {
    if (isTagNodeKey(node.id ?? '')) {
      return;
    }
    if (node.ghost) {
      setSelectedGhost(node);
      return;
    }
    const ref = viewerRefForGraphNode(node);
    if (ref === null) {
      return;
    }
    const noteId = node.id !== null && isNoteUlid(node.id) ? node.id : null;
    tabState.openTab(ref, node.title, node.path ?? ref, noteId);
    void navigate(noteId !== null ? `/nota/${noteId}` : `/nota/${encodeURIComponent(ref)}`);
  };

  const copyGhostCommand = async () => {
    if (selectedGhost === null) {
      return;
    }
    const command = ghostCreateCommand(selectedGhost.title);
    try {
      await navigator.clipboard.writeText(command);
      setCopyStatus(t('web.graph.copySuccess'));
    } catch {
      setCopyStatus(command);
    }
  };

  return (
    <div className="graph-view">
      <header className="graph-view__header">
        <div>
          <h1 className="graph-view__title">{t('web.graph.title')}</h1>
          <p className="graph-view__hint">
            {t('web.graph.stats', { nodes: view.nodes.length, edges: view.edges.length })}
            {computing ? t('web.graph.computingLayout') : ''}
          </p>
        </div>
        <div className="graph-view__filters" aria-label={t('web.graph.filters.aria')}>
          <label className="field">
            <span className="field__label">{t('web.common.type')}</span>
            <select
              className="field__control ui-select"
              value={filters.type ?? ''}
              onChange={(event) => {
                const value = event.target.value;
                setFilters((current) => ({ ...current, type: value.length === 0 ? null : value }));
              }}
            >
              <option value="">{t('web.common.allMasculine')}</option>
              {FILTER_TYPES.map((type) => (
                <option key={type} value={type}>
                  {t(noteTypeMessageKey(type))}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="field__label">{t('web.graph.field.folder')}</span>
            <select
              className="field__control ui-select"
              value={filters.folder ?? ''}
              onChange={(event) => {
                const value = event.target.value;
                setFilters((current) => ({
                  ...current,
                  folder: value.length === 0 ? null : value,
                }));
              }}
            >
              <option value="">{t('web.common.allFeminine')}</option>
              {folderOptions.map((folder) => (
                <option key={folder} value={folder}>
                  {folder}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="field__label">{t('web.common.tag')}</span>
            <select
              className="field__control ui-select"
              value={filters.tag ?? ''}
              onChange={(event) => {
                const value = event.target.value;
                setFilters((current) => ({ ...current, tag: value.length === 0 ? null : value }));
              }}
            >
              <option value="">{t('web.common.allFeminine')}</option>
              {tagOptions.map((tag) => (
                <option key={tag} value={tag}>
                  {tag}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="field__label">{t('web.graph.field.rel')}</span>
            <select
              className="field__control ui-select"
              value={filters.rel ?? ''}
              onChange={(event) => {
                const value = event.target.value;
                setFilters((current) => ({ ...current, rel: value.length === 0 ? null : value }));
              }}
            >
              <option value="">{t('web.common.allFeminine')}</option>
              {relOptions.map((rel) => (
                <option key={rel} value={rel}>
                  {rel}
                </option>
              ))}
            </select>
          </label>
          <label className="field field--checkbox">
            <input
              type="checkbox"
              checked={filters.hideOrphans}
              onChange={(event) => {
                setFilters((current) => ({ ...current, hideOrphans: event.target.checked }));
              }}
            />
            <span>{t('web.graph.filter.hideOrphans')}</span>
          </label>
          <label className="field field--checkbox">
            <input
              type="checkbox"
              checked={filters.showTagNodes}
              onChange={(event) => {
                setFilters((current) => ({ ...current, showTagNodes: event.target.checked }));
              }}
            />
            <span>{t('web.graph.filter.showTagNodes')}</span>
          </label>
        </div>
      </header>

      {loading ? (
        <p className="graph-view__status" role="status">
          {t('web.graph.loading')}
        </p>
      ) : error !== null ? (
        <p className="graph-view__status graph-view__status--error" role="alert">
          {error}
        </p>
      ) : layout === null ? (
        <p className="graph-view__status" role="status">
          {t('web.graph.preparing')}
        </p>
      ) : (
        <div className="graph-view__body">
          <div
            className="graph-view__canvas"
            onWheel={(event) => {
              event.preventDefault();
              const factor = event.deltaY > 0 ? 0.9 : 1.1;
              setZoom((value) => Math.min(4, Math.max(0.25, value * factor)));
            }}
            onPointerDown={(event) => {
              if (event.button !== 0) {
                return;
              }
              dragRef.current = { x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y };
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerMove={(event) => {
              const drag = dragRef.current;
              if (drag === null) {
                return;
              }
              setPan({
                x: drag.panX + (event.clientX - drag.x),
                y: drag.panY + (event.clientY - drag.y),
              });
            }}
            onPointerUp={(event) => {
              dragRef.current = null;
              event.currentTarget.releasePointerCapture(event.pointerId);
            }}
          >
            <svg
              className="graph-view__svg"
              viewBox={`0 0 ${String(LAYOUT_WIDTH)} ${String(LAYOUT_HEIGHT)}`}
              role="img"
              aria-label={t('web.graph.aria')}
            >
              <g transform={`translate(${String(pan.x)} ${String(pan.y)}) scale(${String(zoom)})`}>
                {view.edges.map((edge, index) => {
                  const from = layout.get(edge.from);
                  const to = layout.get(edge.to);
                  if (from === undefined || to === undefined) {
                    return null;
                  }
                  const dimmed =
                    highlight !== null && (!highlight.has(edge.from) || !highlight.has(edge.to));
                  return (
                    <line
                      key={`${edge.from}-${edge.to}-${String(index)}`}
                      className={`graph-view__edge${dimmed ? ' graph-view__edge--dim' : ''}`}
                      x1={from.x}
                      y1={from.y}
                      x2={to.x}
                      y2={to.y}
                    />
                  );
                })}
                {view.nodes.map((node) => {
                  const key = graphNodeKey(node);
                  const pos = layout.get(key);
                  if (pos === undefined) {
                    return null;
                  }
                  const dimmed = highlight !== null && !highlight.has(key);
                  const label = node.title.length > 0 ? node.title : key;
                  const showLabel = showLabels || key === hoveredKey;
                  return (
                    <g
                      key={key}
                      className={`graph-view__node-group${dimmed ? ' graph-view__node-group--dim' : ''}`}
                      onMouseEnter={() => {
                        setHoveredKey(key);
                      }}
                      onMouseLeave={() => {
                        setHoveredKey((current) => (current === key ? null : current));
                      }}
                      onPointerDown={(event) => {
                        event.stopPropagation();
                      }}
                    >
                      <circle
                        className={`graph-view__node ${graphNodeCssClass(node)}`}
                        cx={pos.x}
                        cy={pos.y}
                        r={node.ghost ? 8 : 7}
                        tabIndex={0}
                        role="button"
                        aria-label={label}
                        onClick={() => {
                          openNote(node);
                        }}
                        onKeyDown={(event) => {
                          if (event.key !== 'Enter' && event.key !== ' ') {
                            return;
                          }
                          event.preventDefault();
                          openNote(node);
                        }}
                      />
                      {showLabel ? (
                        <text
                          className="graph-view__label"
                          x={pos.x}
                          y={pos.y + 14}
                          textAnchor="middle"
                        >
                          {label}
                        </text>
                      ) : null}
                    </g>
                  );
                })}
              </g>
            </svg>
          </div>
          <aside className="graph-view__aside" aria-label={t('web.graph.aside.aria')}>
            <h2 className="graph-view__aside-title">{t('web.graph.legend')}</h2>
            <ul className="graph-view__legend">
              {GRAPH_LEGEND_ENTRIES.map((item) => (
                <li key={item.className}>
                  <span
                    className={`graph-view__legend-swatch ${item.className}`}
                    aria-hidden="true"
                  />
                  {t(item.labelKey)}
                </li>
              ))}
            </ul>
            {selectedGhost !== null ? (
              <section className="graph-view__ghost" aria-label={t('web.graph.ghost.aria')}>
                <h3 className="graph-view__ghost-title">{selectedGhost.title}</h3>
                <p className="graph-view__ghost-hint">{t('web.graph.ghost.hint')}</p>
                <button
                  type="button"
                  className="ui-btn ui-btn--primary ui-btn--sm"
                  onClick={() => {
                    openNewNote({
                      title: selectedGhost.title,
                      replaceTabRef: selectedGhost.title,
                    });
                  }}
                >
                  {t('web.common.createNote')}
                </button>
                <button
                  type="button"
                  className="ui-btn ui-btn--ghost ui-btn--sm"
                  onClick={() => void copyGhostCommand()}
                >
                  {t('web.graph.copyCli')}
                </button>
                {copyStatus !== null ? (
                  <p className="graph-view__ghost-command" role="status">
                    {copyStatus}
                  </p>
                ) : null}
              </section>
            ) : null}
          </aside>
        </div>
      )}
    </div>
  );
}
