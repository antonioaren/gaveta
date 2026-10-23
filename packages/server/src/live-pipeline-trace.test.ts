import { performance } from 'node:perf_hooks';
import { expect, it } from 'vitest';
import {
  markChokidar,
  markDebounceFlush,
  markIndexUpdated,
  markWriteFinished,
  resetLivePipelineTracesForTests,
  takePipelineTrace,
} from './live-pipeline-trace.ts';

it('builds stage offsets from write finished through WebSocket emit', () => {
  resetLivePipelineTracesForTests();
  const t0 = performance.now();
  markWriteFinished('nota.html', t0);
  markChokidar('nota.html', t0 + 10);
  markDebounceFlush('nota.html', t0 + 50);
  markIndexUpdated('nota.html', t0 + 80);
  const trace = takePipelineTrace('nota.html', t0 + 100);
  expect(trace).toEqual({
    anchor: 'writeFinished',
    path: 'nota.html',
    stages: {
      writeFinished: 0,
      chokidar: 10,
      debounceFlush: 50,
      indexUpdated: 80,
      wsSent: 100,
    },
  });
});
