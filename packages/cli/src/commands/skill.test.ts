import { mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { EXIT_CODES } from '@gaveta/core';
import { expect, it } from 'vitest';
import { runCli, type CliIo } from '../run.ts';

async function withTemp(run: (directory: string, home: string) => Promise<void>): Promise<void> {
  const parent = await mkdtemp(join(tmpdir(), 'gaveta-cli-skill-'));
  const home = join(parent, 'home');
  const project = join(parent, 'project');
  await mkdir(home);
  await mkdir(project);
  try {
    await run(project, home);
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
}

function capture(cwd: string, home: string): { io: CliIo; stdout: () => string } {
  let out = '';
  return {
    io: {
      cwd,
      env: { HOME: home },
      stdout(chunk: string) {
        out += chunk;
      },
      stderr() {
        return undefined;
      },
    },
    stdout: () => out,
  };
}

function argv(...args: string[]): string[] {
  return ['node', 'gaveta', ...args];
}

it('installs and reports skill status with JSON envelopes', async () => {
  await withTemp(async (project, home) => {
    const install = capture(project, home);
    expect(await runCli(argv('skill', 'install', '--target', 'cursor', '--json'), install.io)).toBe(
      EXIT_CODES.ok,
    );
    const installBody = JSON.parse(install.stdout()) as {
      data: { written: string[] };
    };
    expect(installBody.data.written.length).toBeGreaterThan(0);
    expect(await readFile(join(project, '.cursor/skills/gaveta/SKILL.md'), 'utf8')).toContain(
      'name: gaveta',
    );

    const status = capture(project, home);
    expect(await runCli(argv('skill', 'status', '--target', 'cursor', '--json'), status.io)).toBe(
      EXIT_CODES.ok,
    );
    const statusBody = JSON.parse(status.stdout()) as {
      data: { locations: { state: string }[] };
      warnings: unknown[];
    };
    expect(statusBody.data.locations[0]?.state).toBe('current');
    expect(statusBody.warnings).toEqual([]);
  });
});
