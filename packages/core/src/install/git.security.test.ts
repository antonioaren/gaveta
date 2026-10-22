import { expect, it } from 'vitest';
import { join } from 'node:path';
import { withTemp } from '../vault/fixture.ts';
import { createBareGitFixture } from './git-fixture.ts';
import { checkGitUpdate } from './git.ts';

it('runs git with argument arrays when the repo path contains shell metacharacters', async () => {
  await withTemp(async (parent) => {
    const base = join(parent, 'repo;injected');
    const { worktree } = await createBareGitFixture(base);
    expect(checkGitUpdate({ repoRoot: worktree, channel: 'main', checkOnly: true })).toMatchObject({
      currentVersion: '0.1.0',
      upToDate: true,
    });
  });
});
