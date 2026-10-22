import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EXIT_CODES, GavetaError, MIN_SUPPORTED_NODE } from '@gaveta/core';
import { expect, it, vi } from 'vitest';
import { runCli, type CliIo } from './run.ts';

vi.mock('@gaveta/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@gaveta/core')>();
  return {
    ...actual,
    assertRuntimeSupported: vi.fn(actual.assertRuntimeSupported),
  };
});

import { assertRuntimeSupported } from '@gaveta/core';

async function withTemp(run: (directory: string) => Promise<void>): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), 'gaveta-cli-runtime-'));
  try {
    await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

function capture(cwd: string): { io: CliIo; stdout: () => string; stderr: () => string } {
  let out = '';
  let err = '';
  return {
    io: {
      cwd,
      env: {},
      stdout(chunk: string) {
        out += chunk;
      },
      stderr(chunk: string) {
        err += chunk;
      },
    },
    stdout: () => out,
    stderr: () => err,
  };
}

it('surfaces E_RUNTIME_UNSUPPORTED before running a command when the probe fails', async () => {
  vi.mocked(assertRuntimeSupported).mockImplementationOnce(() => {
    throw new GavetaError('E_RUNTIME_UNSUPPORTED', {
      version: '22.14.0',
      minimum: MIN_SUPPORTED_NODE,
    });
  });

  await withTemp(async (directory) => {
    const captured = capture(directory);
    expect(await runCli(['node', 'gaveta', 'version', '--json'], captured.io)).toBe(
      EXIT_CODES.internal,
    );
    expect(captured.stderr()).toBe('');
    expect(JSON.parse(captured.stdout())).toMatchObject({
      ok: false,
      error: { code: 'E_RUNTIME_UNSUPPORTED' },
    });
  });
});
