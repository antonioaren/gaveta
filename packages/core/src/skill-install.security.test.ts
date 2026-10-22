import { mkdir, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { expect, it } from 'vitest';
import { resolveInsideAnchor, skillInstall } from './skill-install.ts';

const sampleCommands = [
  { name: 'search', summary: 'Busca.', example: 'gaveta search q --json' },
  { name: 'guide', summary: 'Guía.', example: 'gaveta guide --json' },
] as const;

async function withTemp(run: (home: string, project: string) => Promise<void>): Promise<void> {
  const parent = await mkdtemp(join(tmpdir(), 'gaveta-skill-security-'));
  const home = join(parent, 'home');
  const project = join(parent, 'project');
  await mkdir(home);
  await mkdir(project);
  try {
    await run(home, project);
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
}

it('rejects traversal and symlink escapes from the project anchor', async () => {
  await withTemp(async (home, project) => {
    await symlink(home, join(project, '.cursor'));

    await expect(resolveInsideAnchor(project, '../home/secret.txt')).rejects.toMatchObject({
      code: 'E_SKILL_PATH',
    });
    await expect(
      skillInstall({
        cwd: project,
        home,
        target: 'cursor',
        cliVersion: '0.0.0',
        commands: sampleCommands,
      }),
    ).rejects.toMatchObject({ code: 'E_SKILL_PATH' });
  });
});

it('installs under a temp HOME for user scope', async () => {
  await withTemp(async (home, project) => {
    const result = await skillInstall({
      cwd: project,
      home,
      target: 'claude',
      scope: 'user',
      cliVersion: '0.0.0',
      commands: sampleCommands,
    });
    expect(result.written[0]).toBe('.claude/skills/gaveta/SKILL.md');
    await expect(writeFile(join(project, '.claude/skills/gaveta/SKILL.md'), 'x')).rejects.toThrow();
  });
});
