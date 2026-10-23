import { useEffect, useMemo, useState } from 'react';
import type { ForceLayoutEdge, ForceLayoutNode, ForceLayoutPosition } from './force-layout.ts';
import type { LayoutWorkerRequest, LayoutWorkerResponse } from './force-layout.worker.ts';

const EMPTY_LAYOUT = new Map<string, ForceLayoutPosition>();

export function useForceLayout(
  nodes: readonly ForceLayoutNode[],
  edges: readonly ForceLayoutEdge[],
  width: number,
  height: number,
): { readonly layout: Map<string, ForceLayoutPosition> | null; readonly computing: boolean } {
  const [layout, setLayout] = useState<Map<string, ForceLayoutPosition> | null>(null);
  const [computing, setComputing] = useState(nodes.length > 0);
  const isEmpty = nodes.length === 0;

  const serialized = useMemo(
    () => JSON.stringify({ nodes, edges, width, height }),
    [nodes, edges, width, height],
  );

  useEffect(() => {
    if (isEmpty) {
      return;
    }
    const worker = new Worker(new URL('./force-layout.worker.ts', import.meta.url), {
      type: 'module',
    });
    const currentId = 1;
    worker.onmessage = (event: MessageEvent<LayoutWorkerResponse>) => {
      if (event.data.id !== currentId) {
        return;
      }
      const next = new Map<string, ForceLayoutPosition>();
      for (const entry of event.data.positions) {
        next.set(entry.key, { x: entry.x, y: entry.y });
      }
      setLayout(next);
      setComputing(false);
      worker.terminate();
    };
    worker.onerror = () => {
      setComputing(false);
      worker.terminate();
    };
    const parsed = JSON.parse(serialized) as LayoutWorkerRequest;
    const message: LayoutWorkerRequest = {
      id: currentId,
      nodes: parsed.nodes,
      edges: parsed.edges,
      width: parsed.width,
      height: parsed.height,
    };
    worker.postMessage(message);
    return () => {
      worker.terminate();
    };
  }, [isEmpty, serialized]);

  if (isEmpty) {
    return { layout: EMPTY_LAYOUT, computing: false };
  }

  return { layout, computing };
}
