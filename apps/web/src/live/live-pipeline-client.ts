import type { LivePipelineStages } from './live-pipeline-types.ts';

export interface ClientLivePipelineSample {
  readonly path: string;
  readonly serverStages: LivePipelineStages;
  readonly wsReceivedMs: number;
  readonly renderTicketMs?: number;
  readonly iframeLoadMs?: number;
}

let lastSample: ClientLivePipelineSample | null = null;

export function recordLivePipelineFromServer(
  path: string,
  serverStages: LivePipelineStages,
  wsReceivedMs: number,
): void {
  lastSample = {
    path,
    serverStages,
    wsReceivedMs,
  };
  (globalThis as { __gavetaLastPipeline?: ClientLivePipelineSample }).__gavetaLastPipeline =
    lastSample;
}

export function recordRenderTicketMs(durationMs: number): void {
  if (lastSample === null) {
    return;
  }
  lastSample = { ...lastSample, renderTicketMs: durationMs };
}

export function recordIframeLoadMs(durationMs: number): void {
  if (lastSample === null) {
    return;
  }
  lastSample = { ...lastSample, iframeLoadMs: durationMs };
}

export function peekLastLivePipelineSample(): ClientLivePipelineSample | null {
  return lastSample;
}

/** Test-only reset. */
export function resetLivePipelineClientForTests(): void {
  lastSample = null;
}
