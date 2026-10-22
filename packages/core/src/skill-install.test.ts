import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { join } from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { buildSkill } from './skill.ts';
import { expect, it } from 'vitest';
import {
  compareCliVersions,
  parseInstalledSkillVersion,
  skillInstall,
  skillStatus,
} from './skill-install.ts';

const sampleCommands = [
  { name: 'search', summary: 'Busca.', example: 'gaveta search q --json' },
  { name: 'guide', summary: 'Guía.', example: 'gaveta guide --json' },
] as const;

async function withTemp(run: (home: string, project: string) => Promise<void>): Promise<void> {
  const parent = await mkdtemp(join(tmpdir(), 'gaveta-skill-install-'));
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

it('compares CLI versions numerically', () => {
  expect(compareCliVersions('0.0.0', '0.0.1')).toBeLessThan(0);
  expect(compareCliVersions('1.2.3', '1.2.3')).toBe(0);
  expect(compareCliVersions('2.0.0', '1.9.9')).toBeGreaterThan(0);
});

it('parses the installed skill version from front matter', () => {
  const text = ['---', 'name: gaveta', 'gaveta-cli-version: 1.2.3', '---', ''].join('\n');
  expect(parseInstalledSkillVersion(text)).toBe('1.2.3');
});

it('installs the skill into the project tree and stays idempotent', async () => {
  await withTemp(async (home, project) => {
    const first = await skillInstall({
      cwd: project,
      home,
      target: 'cursor',
      cliVersion: '0.0.0',
      commands: sampleCommands,
    });
    expect(first.written.length).toBeGreaterThan(0);
    expect(first.skipped).toEqual([]);
    const skillPath = join(project, '.cursor/skills/gaveta/SKILL.md');
    expect(await readFile(skillPath, 'utf8')).toContain('name: gaveta');

    const second = await skillInstall({
      cwd: project,
      home,
      target: 'cursor',
      cliVersion: '0.0.0',
      commands: sampleCommands,
    });
    expect(second.written).toEqual([]);
    expect(second.skipped).toEqual(['.cursor/skills/gaveta']);
  });
});

it('reports outdated status and updates on install', async () => {
  await withTemp(async (home, project) => {
    const directory = join(project, '.cursor/skills/gaveta');
    await mkdir(directory, { recursive: true });
    const oldBundle = buildSkill({ commands: sampleCommands, cliVersion: '0.0.0' });
    for (const file of oldBundle.files) {
      await mkdir(path.dirname(join(directory, file.path)), { recursive: true });
      await writeFile(join(directory, file.path), file.contents, 'utf8');
    }

    const beforeStatus = await skillStatus({
      cwd: project,
      home,
      target: 'cursor',
      cliVersion: '0.1.0',
      commands: sampleCommands,
    });
    expect(beforeStatus.locations[0]?.state).toBe('outdated');

    const updated = await skillInstall({
      cwd: project,
      home,
      target: 'cursor',
      cliVersion: '0.1.0',
      commands: sampleCommands,
    });
    expect(updated.written.length).toBeGreaterThan(0);
    const after = await skillStatus({
      cwd: project,
      home,
      target: 'cursor',
      cliVersion: '0.1.0',
      commands: sampleCommands,
    });
    expect(after.locations[0]?.state).toBe('current');
  });
});

it('refuses to overwrite a modified skill without --force', async () => {
  await withTemp(async (home, project) => {
    await skillInstall({
      cwd: project,
      home,
      target: 'cursor',
      cliVersion: '0.0.0',
      commands: sampleCommands,
    });
    const skillPath = join(project, '.cursor/skills/gaveta/SKILL.md');
    await writeFile(skillPath, `${await readFile(skillPath, 'utf8')}\n# cambio manual\n`, 'utf8');

    await expect(
      skillInstall({
        cwd: project,
        home,
        target: 'cursor',
        cliVersion: '0.0.0',
        commands: sampleCommands,
      }),
    ).rejects.toMatchObject({ code: 'E_SKILL_MODIFIED' });

    await skillInstall({
      cwd: project,
      home,
      target: 'cursor',
      cliVersion: '0.0.0',
      commands: sampleCommands,
      force: true,
    });
    expect(await readFile(skillPath, 'utf8')).not.toContain('# cambio manual');
  });
});

it('lists paths on dry-run without writing', async () => {
  await withTemp(async (home, project) => {
    const result = await skillInstall({
      cwd: project,
      home,
      target: 'codex',
      dryRun: true,
      cliVersion: '0.0.0',
      commands: sampleCommands,
    });
    expect(result.written).toEqual([
      '.agents/skills/gaveta/SKILL.md',
      '.agents/skills/gaveta/references/flujo.md',
      '.agents/skills/gaveta/references/tipos-de-nota.md',
    ]);
    await expect(
      readFile(join(project, '.agents/skills/gaveta/SKILL.md'), 'utf8'),
    ).rejects.toThrow();
  });
});
