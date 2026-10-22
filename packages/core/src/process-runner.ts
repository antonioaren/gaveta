import { spawnSync } from 'node:child_process';

export interface SpawnResult {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

export interface ProcessRunner {
  spawn(
    file: string,
    args: readonly string[],
    options: { readonly cwd: string; readonly env?: NodeJS.ProcessEnv },
  ): SpawnResult;
}

export const defaultProcessRunner: ProcessRunner = {
  spawn(file, args, options) {
    const result = spawnSync(file, [...args], {
      cwd: options.cwd,
      env: options.env ?? process.env,
      encoding: 'utf8',
    });
    return {
      status: result.status,
      stdout: result.stdout,
      stderr: result.stderr,
    };
  },
};
