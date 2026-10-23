import type { LivePipelineStages } from './live-pipeline-trace.ts';

export interface StageTotals {
  readonly chokidar: number;
  readonly debounceFlush: number;
  readonly indexUpdated: number;
  readonly wsSent: number;
  readonly wsReceived?: number;
  readonly renderTicket?: number;
  readonly iframeLoad?: number;
  readonly endToEnd?: number;
}

export function sumStages(samples: readonly LivePipelineStages[]): StageTotals {
  const sum = (key: keyof LivePipelineStages): number => {
    let total = 0;
    let count = 0;
    for (const sample of samples) {
      const value = sample[key];
      if (value !== undefined) {
        total += value;
        count += 1;
      }
    }
    return count === 0 ? 0 : total / count;
  };
  return {
    chokidar: sum('chokidar'),
    debounceFlush: sum('debounceFlush'),
    indexUpdated: sum('indexUpdated'),
    wsSent: sum('wsSent'),
  };
}

export function formatStageBreakdown(label: string, totals: StageTotals): string {
  const parts = [
    `chokidar→debounce=${totals.debounceFlush.toFixed(1)}ms`,
    `debounce→index=${(totals.indexUpdated - totals.debounceFlush).toFixed(1)}ms`,
    `index→ws=${(totals.wsSent - totals.indexUpdated).toFixed(1)}ms`,
    `write→ws=${totals.wsSent.toFixed(1)}ms`,
  ];
  if (totals.wsReceived !== undefined) {
    parts.push(`ws→client=${totals.wsReceived.toFixed(1)}ms`);
  }
  if (totals.renderTicket !== undefined) {
    parts.push(`ticket=${totals.renderTicket.toFixed(1)}ms`);
  }
  if (totals.iframeLoad !== undefined) {
    parts.push(`iframe=${totals.iframeLoad.toFixed(1)}ms`);
  }
  if (totals.endToEnd !== undefined) {
    parts.push(`e2e=${totals.endToEnd.toFixed(1)}ms`);
  }
  return `${label}: ${parts.join('; ')}`;
}

export function percentile(samples: readonly number[], p: number): number {
  const sorted = [...samples].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, index)] ?? 0;
}
