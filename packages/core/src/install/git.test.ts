import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { defaultProcessRunner } from '../process-runner.ts';
import { withTemp } from '../vault/fixture.ts';
import { createBareGitFixture, pushVersionBump } from './git-fixture.ts';
import { applyGitUpdate, checkGitUpdate, resolveInstallInfo } from './git.ts';
import { isAllowedGavetaRemote } from './remote.ts';

function runGit(cwd: string, args: string[]): void {
  const result = defaultProcessRunner.spawn('git', args, { cwd });
  if ((result.status ?? 1) !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${result.stderr}`);
  }
}

it('accepts official Gaveta git remotes', () => {
  expect(isAllowedGavetaRemote('https://github.com/antonioaren/gaveta.git')).toBe(true);
  expect(isAllowedGavetaRemote('git@github.com:antonioaren/gaveta.git')).toBe(true);
  expect(isAllowedGavetaRemote('https://evil.example/gaveta.git')).toBe(false);
});

it('refuses dirty trees', async () => {
  await withTemp(async (parent) => {
    const { worktree } = await createBareGitFixture(parent);
    await writeFile(join(worktree, 'dirty.txt'), 'x');
    expect(() =>
      checkGitUpdate({ repoRoot: worktree, channel: 'stable', checkOnly: true }),
    ).toThrow(expect.objectContaining({ code: 'E_UPDATE_DIRTY' }));
  });
});

it('refuses checkouts that are not on main', async () => {
  await withTemp(async (parent) => {
    const { worktree } = await createBareGitFixture(parent);
    runGit(worktree, ['checkout', '-b', 'feature']);
    expect(() =>
      checkGitUpdate({ repoRoot: worktree, channel: 'stable', checkOnly: true }),
    ).toThrow(expect.objectContaining({ code: 'E_UPDATE_BRANCH' }));
  });
});

it('reports available updates and fast-forwards on stable channel', async () => {
  await withTemp(async (parent) => {
    const { worktree } = await createBareGitFixture(parent);
    await pushVersionBump(worktree, '0.1.1');
    runGit(worktree, ['push', 'origin', 'main', '--tags']);
    runGit(worktree, ['reset', '--hard', 'v0.1.0']);
    const check = checkGitUpdate({
      repoRoot: worktree,
      channel: 'stable',
      checkOnly: true,
    });
    expect(check.upToDate).toBe(false);
    expect(check.target?.version).toBe('0.1.1');
    const applied = await applyGitUpdate({
      repoRoot: worktree,
      channel: 'stable',
      checkOnly: false,
    });
    expect(applied.applied).toBe(true);
    expect(applied.currentVersion).toBe('0.1.1');
    expect(applied.lockfileChanged).toBe(false);
    expect(applied.pnpmInstallRan).toBe(false);
  });
});

it('refuses non-fast-forward updates', async () => {
  await withTemp(async (parent) => {
    const { worktree } = await createBareGitFixture(parent);
    await pushVersionBump(worktree, '0.1.1');
    runGit(worktree, ['push', 'origin', 'main', '--tags']);
    runGit(worktree, ['reset', '--hard', 'v0.1.0']);
    await writeFile(join(worktree, 'local.txt'), 'diverged\n');
    runGit(worktree, ['add', 'local.txt']);
    runGit(worktree, ['commit', '-m', 'local']);
    runGit(worktree, ['fetch', 'origin']);
    expect(() => checkGitUpdate({ repoRoot: worktree, channel: 'main', checkOnly: true })).toThrow(
      expect.objectContaining({ code: 'E_UPDATE_NOT_FAST_FORWARD' }),
    );
  });
});

it('detects git installs from the CLI entry path', async () => {
  const info = await resolveInstallInfo(join(import.meta.dirname, '../../../cli/bin/gaveta.js'));
  expect(info.method).toBe('git');
  expect(info.packageVersion).toBe('0.1.0');
  expect(typeof info.git?.dirty).toBe('boolean');
});
