import { computeForceLayout, type ForceLayoutEdge, type ForceLayoutNode } from './force-layout.ts';

export interface LayoutWorkerRequest {
  readonly id: number;
  readonly nodes: readonly ForceLayoutNode[];
  readonly edges: readonly ForceLayoutEdge[];
  readonly width: number;
  readonly height: number;
}

export interface LayoutWorkerResponse {
  readonly id: number;
  readonly positions: readonly {
    readonly key: string;
    readonly x: number;
    readonly y: number;
  }[];
}

self.onmessage = (event: MessageEvent<LayoutWorkerRequest>) => {
  const { id, nodes, edges, width, height } = event.data;
  const layout = computeForceLayout(nodes, edges, { width, height });
  const positions = [...layout.entries()].map(([key, pos]) => ({ key, x: pos.x, y: pos.y }));
  const response: LayoutWorkerResponse = { id, positions };
  self.postMessage(response);
};
