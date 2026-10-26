import { prepareWebDistForE2eRun, teardownWebDistForE2eRun } from './helpers.ts';

export default function globalSetup(): void {
  prepareWebDistForE2eRun();
  return () => {
    teardownWebDistForE2eRun();
  };
}
