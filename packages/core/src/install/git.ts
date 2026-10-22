import { lstat, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { GavetaError } from '../errors.ts';
import { changelogEntriesBetween } from '../changelog.ts';
import { type ProcessRunner, defaultProcessRunner } from '../process-runner.ts';
import { compareCliVersions } from '../skill-install.ts';
import { readWorkspaceVersion } from '../workspace-version.ts';
import { isAllowedGavetaRemote, normalizeRemoteUrl } from './remote.ts';

export type InstallMethod = 'git' | 'unknown';
export type UpdateChannel = 'stable' | 'main';

export interface GitCheckoutInfo {
  readonly commit: string;
  readonly shortCommit: string;
  readonly dirty: boolean;
  readonly branch: string | null;
}

export interface InstallInfo {
  readonly method: InstallMethod;
  readonly packageVersion: string;
  readonly nodeVersion: string;
  readonly repoRoot: string | null;
  readonly git: GitCheckoutInfo | null;
}

export interface GitUpdateTarget {
  readonly ref: string;
  readonly version: string;
  readonly commit: string;
  readonly shortCommit: string;
  readonly commitCount: number;
  readonly changelogEntries: readonly { readonly version: string; readonly body: string }[];
}

export interface GitUpdateCheckResult {
  readonly currentVersion: string;
  readonly currentCommit: string;
  readonly currentShortCommit: string;
  readonly target: GitUpdateTarget | null;
  readonly upToDate: boolean;
}

export interface GitUpdateApplyResult extends GitUpdateCheckResult {
  readonly previousVersion: string;
  readonly applied: boolean;
  readonly lockfileChanged: boolean;
  readonly pnpmInstallRan: boolean;
}

export interface GitUpdateOptions {
  readonly repoRoot: string;
  readonly channel: UpdateChannel;
  readonly checkOnly: boolean;
  readonly runner?: ProcessRunner;
  readonly changelogMarkdown?: string;
}

function runnerOf(options: GitUpdateOptions): ProcessRunner {
  return options.runner ?? defaultProcessRunner;
}

function runGit(
  runner: ProcessRunner,
  repoRoot: string,
  args: readonly string[],
): { ok: boolean; stdout: string; stderr: string } {
  assertSafeRepoRoot(repoRoot);
  const result = runner.spawn('git', args, { cwd: repoRoot });
  const status = result.status ?? 1;
  return { ok: status === 0, stdout: result.stdout.trim(), stderr: result.stderr.trim() };
}

export async function resolveInstallInfo(cliEntryPath: string): Promise<InstallInfo> {
  const packageVersion = readWorkspaceVersion();
  let resolved: string;
  try {
    resolved = await realpath(cliEntryPath);
  } catch {
    return {
      method: 'unknown',
      packageVersion,
      nodeVersion: process.version,
      repoRoot: null,
      git: null,
    };
  }
  const repoRoot = await findGitRepoRoot(path.dirname(resolved));
  if (repoRoot === null) {
    return {
      method: 'unknown',
      packageVersion,
      nodeVersion: process.version,
      repoRoot: null,
      git: null,
    };
  }
  const runner = defaultProcessRunner;
  const git = readGitCheckoutInfo(repoRoot, runner);
  return {
    method: 'git',
    packageVersion,
    nodeVersion: process.version,
    repoRoot,
    git,
  };
}

export function checkGitUpdate(options: GitUpdateOptions): GitUpdateCheckResult {
  const runner = runnerOf(options);
  assertTrustedUpdateOrigin(options.repoRoot, runner);
  assertCleanAndOnMain(options.repoRoot, runner);
  const head = readCommitAtRef(options.repoRoot, 'HEAD', runner);
  const currentVersion = readPackageVersionAtRef(options.repoRoot, 'HEAD', runner);
  const target = resolveUpdateTarget(options, runner, currentVersion, head.commit);
  if (target === null) {
    return {
      currentVersion,
      currentCommit: head.commit,
      currentShortCommit: head.shortCommit,
      target: null,
      upToDate: true,
    };
  }
  if (target.commit === head.commit) {
    return {
      currentVersion,
      currentCommit: head.commit,
      currentShortCommit: head.shortCommit,
      target,
      upToDate: true,
    };
  }
  if (usesCommitBasedUpdate(options, runner)) {
    assertFastForwardPossible(options.repoRoot, target.ref, runner);
    return {
      currentVersion,
      currentCommit: head.commit,
      currentShortCommit: head.shortCommit,
      target,
      upToDate: false,
    };
  }
  if (compareCliVersions(target.version, currentVersion) <= 0) {
    return {
      currentVersion,
      currentCommit: head.commit,
      currentShortCommit: head.shortCommit,
      target,
      upToDate: true,
    };
  }
  assertFastForwardPossible(options.repoRoot, target.ref, runner);
  return {
    currentVersion,
    currentCommit: head.commit,
    currentShortCommit: head.shortCommit,
    target,
    upToDate: false,
  };
}

export async function applyGitUpdate(options: GitUpdateOptions): Promise<GitUpdateApplyResult> {
  const check = checkGitUpdate(options);
  if (options.checkOnly) {
    return {
      ...check,
      previousVersion: check.currentVersion,
      applied: false,
      lockfileChanged: false,
      pnpmInstallRan: false,
    };
  }
  if (check.upToDate || check.target === null || check.target.commit === check.currentCommit) {
    return {
      ...check,
      previousVersion: check.currentVersion,
      applied: false,
      lockfileChanged: false,
      pnpmInstallRan: false,
    };
  }
  const runner = runnerOf(options);
  const beforeLock = await readFileIfExists(path.join(options.repoRoot, 'pnpm-lock.yaml'));
  const merge = runGit(runner, options.repoRoot, ['merge', '--ff-only', check.target.ref]);
  if (!merge.ok) {
    throw new GavetaError('E_UPDATE_NOT_FAST_FORWARD');
  }
  const afterLock = await readFileIfExists(path.join(options.repoRoot, 'pnpm-lock.yaml'));
  const lockfileChanged = beforeLock !== afterLock;
  let pnpmInstallRan = false;
  if (lockfileChanged) {
    const hasPackage = await readFileIfExists(path.join(options.repoRoot, 'package.json'));
    if (hasPackage !== null) {
      const pnpm = runner.spawn('pnpm', ['install', '--frozen-lockfile'], {
        cwd: options.repoRoot,
      });
      if ((pnpm.status ?? 1) !== 0) {
        throw new GavetaError('E_UPDATE_FAILED');
      }
      pnpmInstallRan = true;
    }
  }
  const head = readCommitAtRef(options.repoRoot, 'HEAD', runner);
  const currentVersion = readPackageVersionAtRef(options.repoRoot, 'HEAD', runner);
  const changelogEntries = changelogForUpdate(
    options,
    runner,
    options.repoRoot,
    check.currentVersion,
    currentVersion,
    'HEAD',
  );
  const target: GitUpdateTarget = {
    ...check.target,
    version: currentVersion,
    commit: head.commit,
    shortCommit: head.shortCommit,
    commitCount: 0,
    changelogEntries,
  };
  return {
    currentVersion,
    currentCommit: head.commit,
    currentShortCommit: head.shortCommit,
    target,
    upToDate: true,
    previousVersion: check.currentVersion,
    applied: true,
    lockfileChanged,
    pnpmInstallRan,
  };
}

export function readChangelogMarkdownAtRef(
  repoRoot: string,
  ref: string,
  runner: ProcessRunner = defaultProcessRunner,
): string | null {
  const shown = runGit(runner, repoRoot, ['show', `${ref}:CHANGELOG.md`]);
  if (!shown.ok) {
    return null;
  }
  return shown.stdout;
}

function usesCommitBasedUpdate(options: GitUpdateOptions, runner: ProcessRunner): boolean {
  if (options.channel === 'main') {
    return true;
  }
  return latestStableTag(options.repoRoot, runner) === null;
}

function resolveUpdateTarget(
  options: GitUpdateOptions,
  runner: ProcessRunner,
  currentVersion: string,
  headCommit: string,
): GitUpdateTarget | null {
  const fetch = runGit(runner, options.repoRoot, ['fetch', 'origin', '--tags']);
  if (!fetch.ok) {
    throw new GavetaError('E_UPDATE_FAILED');
  }
  if (options.channel === 'main') {
    return resolveMainChannelTarget(options, runner, currentVersion, headCommit);
  }
  const tag = latestStableTag(options.repoRoot, runner);
  if (tag === null) {
    return resolveMainChannelTarget(options, runner, currentVersion, headCommit);
  }
  const remoteVersion = readPackageVersionAtRef(options.repoRoot, tag, runner);
  const remoteCommit = readCommitAtRef(options.repoRoot, tag, runner);
  const changelog = changelogForUpdate(
    options,
    runner,
    options.repoRoot,
    currentVersion,
    remoteVersion,
    tag,
  );
  return {
    ref: tag,
    version: remoteVersion,
    commit: remoteCommit.commit,
    shortCommit: remoteCommit.shortCommit,
    commitCount: 0,
    changelogEntries: changelog,
  };
}

function resolveMainChannelTarget(
  options: GitUpdateOptions,
  runner: ProcessRunner,
  currentVersion: string,
  headCommit: string,
): GitUpdateTarget | null {
  const mainFetch = runGit(runner, options.repoRoot, ['fetch', 'origin', 'main']);
  if (!mainFetch.ok) {
    throw new GavetaError('E_UPDATE_FAILED');
  }
  const remote = readCommitAtRef(options.repoRoot, 'origin/main', runner);
  const remoteVersion = readPackageVersionAtRef(options.repoRoot, 'origin/main', runner);
  if (remote.commit === headCommit) {
    return null;
  }
  const remoteBehindHead = runGit(runner, options.repoRoot, [
    'merge-base',
    '--is-ancestor',
    remote.commit,
    headCommit,
  ]);
  if (remoteBehindHead.ok) {
    return null;
  }
  const headBehindRemote = runGit(runner, options.repoRoot, [
    'merge-base',
    '--is-ancestor',
    headCommit,
    remote.commit,
  ]);
  if (!headBehindRemote.ok) {
    throw new GavetaError('E_UPDATE_NOT_FAST_FORWARD');
  }
  const count = countCommitsBetween(options.repoRoot, headCommit, remote.commit, runner);
  const changelog = changelogForUpdate(
    options,
    runner,
    options.repoRoot,
    currentVersion,
    remoteVersion,
    'origin/main',
  );
  return {
    ref: 'origin/main',
    version: remoteVersion,
    commit: remote.commit,
    shortCommit: remote.shortCommit,
    commitCount: count,
    changelogEntries: changelog,
  };
}

function countCommitsBetween(
  repoRoot: string,
  fromCommit: string,
  toCommit: string,
  runner: ProcessRunner,
): number {
  const listed = runGit(runner, repoRoot, ['rev-list', '--count', `${fromCommit}..${toCommit}`]);
  if (!listed.ok) {
    throw new GavetaError('E_UPDATE_FAILED');
  }
  const parsed = Number.parseInt(listed.stdout, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new GavetaError('E_UPDATE_FAILED');
  }
  return parsed;
}

function changelogForUpdate(
  options: GitUpdateOptions,
  runner: ProcessRunner,
  repoRoot: string,
  fromVersion: string,
  toVersion: string,
  targetRef: string,
): readonly { readonly version: string; readonly body: string }[] {
  const markdown =
    options.changelogMarkdown ?? readChangelogMarkdownAtRef(repoRoot, targetRef, runner);
  if (markdown === null || markdown.length === 0) {
    return [];
  }
  return changelogEntriesBetween(markdown, fromVersion, toVersion);
}

function latestStableTag(repoRoot: string, runner: ProcessRunner): string | null {
  const listed = runGit(runner, repoRoot, ['tag', '--list', 'v*', '--sort=-v:refname']);
  if (!listed.ok) {
    return null;
  }
  const tags = listed.stdout
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  for (const tag of tags) {
    const version = tag.startsWith('v') ? tag.slice(1) : tag;
    if (/^\d+\.\d+\.\d+$/.test(version)) {
      return tag;
    }
  }
  return null;
}

export function defaultUpdateChannel(
  repoRoot: string,
  runner: ProcessRunner = defaultProcessRunner,
): UpdateChannel {
  const tag = latestStableTag(repoRoot, runner);
  return tag === null ? 'main' : 'stable';
}

function readGitCheckoutInfo(repoRoot: string, runner: ProcessRunner): GitCheckoutInfo {
  const commit = readCommitAtRef(repoRoot, 'HEAD', runner);
  const branch = runGit(runner, repoRoot, ['rev-parse', '--abbrev-ref', 'HEAD']);
  const status = runGit(runner, repoRoot, ['status', '--porcelain']);
  if (!branch.ok || !status.ok) {
    throw new GavetaError('E_UPDATE_FAILED');
  }
  const dirty = status.stdout.length > 0;
  const branchName = branch.stdout === 'HEAD' ? null : branch.stdout;
  return {
    commit: commit.commit,
    shortCommit: commit.shortCommit,
    dirty,
    branch: branchName,
  };
}

function readCommitAtRef(
  repoRoot: string,
  ref: string,
  runner: ProcessRunner,
): { commit: string; shortCommit: string } {
  const commit = runGit(runner, repoRoot, ['rev-parse', ref]);
  const shortCommit = runGit(runner, repoRoot, ['rev-parse', '--short', ref]);
  if (!commit.ok || !shortCommit.ok) {
    throw new GavetaError('E_UPDATE_FAILED');
  }
  return { commit: commit.stdout, shortCommit: shortCommit.stdout };
}

function assertCleanAndOnMain(repoRoot: string, runner: ProcessRunner): void {
  const git = readGitCheckoutInfo(repoRoot, runner);
  if (git.dirty) {
    throw new GavetaError('E_UPDATE_DIRTY');
  }
  if (git.branch !== 'main') {
    throw new GavetaError('E_UPDATE_BRANCH');
  }
}

function assertFastForwardPossible(
  repoRoot: string,
  targetRef: string,
  runner: ProcessRunner,
): void {
  const mergeBase = runGit(runner, repoRoot, ['merge-base', '--is-ancestor', 'HEAD', targetRef]);
  if (!mergeBase.ok) {
    throw new GavetaError('E_UPDATE_NOT_FAST_FORWARD');
  }
}

function assertTrustedUpdateOrigin(repoRoot: string, runner: ProcessRunner): void {
  const remote = runGit(runner, repoRoot, ['config', '--get', 'remote.origin.url']);
  if (!remote.ok) {
    throw new GavetaError('E_UPDATE_REMOTE');
  }
  const override = process.env.GAVETA_UPDATE_REMOTE;
  if (override !== undefined && override.trim().length > 0) {
    if (normalizeRemoteUrl(remote.stdout) === normalizeRemoteUrl(override)) {
      return;
    }
  }
  if (!isAllowedGavetaRemote(remote.stdout)) {
    throw new GavetaError('E_UPDATE_REMOTE');
  }
}

function readPackageVersionAtRef(repoRoot: string, ref: string, runner: ProcessRunner): string {
  const shown = runGit(runner, repoRoot, ['show', `${ref}:VERSION`]);
  if (!shown.ok) {
    throw new GavetaError('E_UPDATE_FAILED');
  }
  const version = shown.stdout.trim();
  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    throw new GavetaError('E_UPDATE_FAILED');
  }
  return version;
}

async function findGitRepoRoot(start: string): Promise<string | null> {
  let current = start;
  for (let depth = 0; depth < 32; depth += 1) {
    const gitDir = path.join(current, '.git');
    try {
      const listed = await lstat(gitDir);
      if (listed.isDirectory() || listed.isFile()) {
        return await realpath(current);
      }
    } catch {
      // continue walking up
    }
    const parent = path.dirname(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }
  return null;
}

function assertSafeRepoRoot(repoRoot: string): void {
  if (repoRoot.length === 0 || repoRoot.includes('\0')) {
    throw new GavetaError('E_ARG_INVALID');
  }
}

async function readFileIfExists(absolute: string): Promise<string | null> {
  try {
    return await readFile(absolute, 'utf8');
  } catch {
    return null;
  }
}
