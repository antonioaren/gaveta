/** Mirrors {@link packages/server/src/live-pipeline-trace.ts} stage offsets. */
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
