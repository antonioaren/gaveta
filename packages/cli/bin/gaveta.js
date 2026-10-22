#!/usr/bin/env node
// The CLI is TypeScript and nothing is emitted. Node 22.18+ strips types by
// default. Older Node 22 still needs --experimental-strip-types, so re-exec once.
import { spawnSync } from 'node:child_process';

const typescript = process.features.typescript;
const stripping = typescript === 'strip' || typescript === 'transform';
const flagged = process.execArgv.includes('--experimental-strip-types');

if (!stripping && !flagged) {
  const script = process.argv[1];
  const child = spawnSync(
    process.execPath,
    ['--experimental-strip-types', ...process.execArgv, script, ...process.argv.slice(2)],
    { stdio: 'inherit' },
  );
  process.exitCode = child.status === null ? 1 : child.status;
} else {
  const { runCli } = await import('../src/run.ts');
  process.exitCode = await runCli(process.argv);
}
