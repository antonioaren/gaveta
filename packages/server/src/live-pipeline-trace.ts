import { performance } from 'node:perf_hooks';

/** Stage offsets in milliseconds from {@link markWriteFinished}. */
export interface LivePipelineStages {
  readonly writeFinished?: number;
  readonly chokidar?: number;
  readonly debounceFlush?: number;
  readonly indexUpdated?: number;
  readonly wsSent?: number;
}

export interface LivePipelineTracePayload {
  readonly anchor: 'writeFinished';
  readonly path: string;
  readonly stages: LivePipelineStages;
}

interface ActiveTrace {
  readonly writeFinishedAt: number;
  readonly path: string;
  chokidarAt?: number;
  debounceFlushAt?: number;
  indexUpdatedAt?: number;
  wsSentAt?: number;
}

const activeByPath = new Map<string, ActiveTrace>();

export function markWriteFinished(relativePath: string, atMs: number = performance.now()): void {
  activeByPath.set(relativePath, { writeFinishedAt: atMs, path: relativePath });
}

export function markChokidar(relativePath: string, atMs: number = performance.now()): void {
  const trace = activeByPath.get(relativePath);
  if (trace === undefined) {
    activeByPath.set(relativePath, { writeFinishedAt: atMs, path: relativePath, chokidarAt: atMs });
    return;
  }
  trace.chokidarAt = atMs;
}

export function markDebounceFlush(relativePath: string, atMs: number = performance.now()): void {
  const trace = activeByPath.get(relativePath);
  if (trace === undefined) {
    return;
  }
  trace.debounceFlushAt = atMs;
}

export function markIndexUpdated(relativePath: string, atMs: number = performance.now()): void {
  const trace = activeByPath.get(relativePath);
  if (trace === undefined) {
    return;
  }
  trace.indexUpdatedAt = atMs;
}

export function takePipelineTrace(
  relativePath: string,
  atWsSent: number = performance.now(),
): LivePipelineTracePayload | undefined {
  const trace = activeByPath.get(relativePath);
  if (trace === undefined) {
    return undefined;
  }
  trace.wsSentAt = atWsSent;
  activeByPath.delete(relativePath);
  const origin = trace.writeFinishedAt;
  const toOffset = (stamp: number | undefined): number | undefined =>
    stamp === undefined ? undefined : Math.max(0, stamp - origin);
  return {
    anchor: 'writeFinished',
    path: trace.path,
    stages: {
      writeFinished: 0,
      chokidar: toOffset(trace.chokidarAt),
      debounceFlush: toOffset(trace.debounceFlushAt),
      indexUpdated: toOffset(trace.indexUpdatedAt),
      wsSent: toOffset(atWsSent),
    },
  };
}

/** Test-only reset. */
export function resetLivePipelineTracesForTests(): void {
  activeByPath.clear();
}
