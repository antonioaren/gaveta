import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { GAVETA_ALLOWED_REMOTES } from './constants.ts';
import { defaultProcessRunner } from '../process-runner.ts';

export interface GitFixture {
  readonly bareRoot: string;
  readonly worktree: string;
}

export async function createBareGitFixture(parent: string): Promise<GitFixture> {
  const bareRoot = join(parent, 'origin.git');
  const worktree = join(parent, 'checkout');
  await mkdir(parent, { recursive: true });
  runGit(parent, ['init', '--bare', bareRoot]);
  await mkdir(worktree, { recursive: true });
  runGit(parent, ['clone', bareRoot, worktree]);
  runGit(worktree, ['config', 'user.email', 'gaveta@test.local']);
  runGit(worktree, ['config', 'user.name', 'Gaveta Tests']);
  runGit(worktree, ['checkout', '-b', 'main']);
  const officialRemote = GAVETA_ALLOWED_REMOTES[0];
  if (officialRemote === undefined) {
    throw new Error('missing official remote constant');
  }
  const bareUrl = pathToFileURL(bareRoot).href;
  runGit(worktree, ['remote', 'set-url', 'origin', officialRemote]);
  runGit(worktree, ['config', `url.${bareUrl}.insteadOf`, officialRemote]);
  await writeFile(join(worktree, 'VERSION'), '0.1.0\n');
  await writeFile(join(worktree, 'package.json'), '{"name":"gaveta-fixture","private":true}\n');
  await writeFile(join(worktree, 'pnpm-lock.yaml'), 'lockVersion: 1\n');
  runGit(worktree, ['add', 'VERSION', 'package.json', 'pnpm-lock.yaml']);
  runGit(worktree, ['commit', '-m', 'v0.1.0']);
  runGit(worktree, ['tag', 'v0.1.0']);
  runGit(worktree, ['push', '-u', 'origin', 'main', '--tags']);
  return { bareRoot, worktree };
}

export async function pushVersionBump(
  worktree: string,
  version: string,
  options: { readonly lockSuffix?: string } = {},
): Promise<void> {
  await writeFile(join(worktree, 'VERSION'), `${version}\n`);
  if (options.lockSuffix !== undefined) {
    await writeFile(join(worktree, 'pnpm-lock.yaml'), `lockVersion: 1\n${options.lockSuffix}\n`);
    runGit(worktree, ['add', 'VERSION', 'pnpm-lock.yaml']);
  } else {
    runGit(worktree, ['add', 'VERSION']);
  }
  runGit(worktree, ['commit', '-m', `v${version}`]);
  runGit(worktree, ['tag', `v${version}`]);
}

function runGit(cwd: string, args: string[]): void {
  const result = defaultProcessRunner.spawn('git', args, { cwd });
  if ((result.status ?? 1) !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${result.stderr}`);
  }
}
