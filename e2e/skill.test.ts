import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GLOBAL_CLI_FLAGS, buildCliSurface, commands } from '@gaveta/cli';
import { findInvalidSkillMentions } from '@gaveta/core';
import { expect, it } from 'vitest';

const root = join(import.meta.dirname, '..');
const bin = join(root, 'packages/cli/bin/gaveta.js');
const skillMd = join(root, 'skills', 'gaveta', 'SKILL.md');

function run(
  args: readonly string[],
  options: { cwd: string; home: string },
): {
  stdout: string;
  stderr: string;
  status: number;
} {
  const env: NodeJS.ProcessEnv = { ...process.env, HOME: options.home };
  delete env.GAVETA_VAULT;
  const result = spawnSync(process.execPath, [bin, ...args], {
    cwd: options.cwd,
    env,
    encoding: 'utf8',
  });
  return {
    stdout: result.stdout,
    stderr: result.stderr,
    status: result.status ?? 1,
  };
}

it('installs the skill from the binary with dry-run and user scope', () => {
  const parent = mkdtempSync(join(tmpdir(), 'gaveta-e2e-skill-install-'));
  const home = join(parent, 'home');
  const project = join(parent, 'project');
  mkdirSync(home);
  mkdirSync(project);
  try {
    const dry = run(['skill', 'install', '--target', 'copilot', '--dry-run', '--json'], {
      cwd: project,
      home,
    });
    expect(dry.status).toBe(0);
    expect(dry.stderr).toBe('');
    const body = JSON.parse(dry.stdout) as { data: { written: string[] } };
    expect(body.data.written).toContain('.github/skills/gaveta/SKILL.md');

    const install = run(['skill', 'install', '--target', 'claude', '--scope', 'user', '--json'], {
      cwd: project,
      home,
    });
    expect(install.status).toBe(0);
    expect(readFileSync(join(home, '.claude/skills/gaveta/SKILL.md'), 'utf8')).toContain(
      'gaveta guide',
    );
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

it('ships the Gaveta agent skill with vault guidance and valid CLI mentions', () => {
  const text = readFileSync(skillMd, 'utf8');
  expect(text).toContain('name: gaveta');
  expect(text).toContain('gaveta-cli-version:');
  expect(text).toContain('GAVETA_VAULT');
  expect(text).toContain('gaveta doctor --json');
  expect(text).toContain('gaveta guide');

  const surface = buildCliSurface(commands);
  const issues = findInvalidSkillMentions(text, {
    commands: surface.commands,
    subcommands: surface.subcommands,
    globalFlags: GLOBAL_CLI_FLAGS,
    flagsFor: surface.flagsFor.bind(surface),
  });
  expect(issues).toEqual([]);
});
