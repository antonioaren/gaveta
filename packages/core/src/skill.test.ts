import { describe, expect, it } from 'vitest';
import { NOTE_TYPES } from './contract.ts';
import type { GuideCommandEntry } from './guide.ts';
import { AGENT_VAULT_BULLETS, AGENT_WORKFLOW_BULLETS } from './agent-workflow.ts';
import { SKILL_CLI_VERSION_FIELD, SKILL_NAME, SKILL_REFERENCE_PATHS, buildSkill } from './skill.ts';
import { findInvalidSkillMentions, type SkillCliCatalog } from './skill-mentions.ts';

const SAMPLE_COMMANDS: GuideCommandEntry[] = [
  { name: 'search', summary: 'Busca.', example: 'gaveta search "sqlite" --json' },
  { name: 'new', summary: 'Crea.', example: 'gaveta new "Título" --type doc --from -' },
  { name: 'edit', summary: 'Edita.', example: 'gaveta edit ref --section id --append --from -' },
  { name: 'read', summary: 'Lee.', example: 'gaveta read ref --as outline' },
  { name: 'backlinks', summary: 'Entrantes.', example: 'gaveta backlinks ref --json' },
  {
    name: 'graph',
    summary: 'Grafo.',
    example: 'gaveta graph ref --depth 1 --json',
  },
  { name: 'validate', summary: 'Valida.', example: 'gaveta validate --json' },
  { name: 'doctor', summary: 'Salud.', example: 'gaveta doctor --json' },
  { name: 'guide', summary: 'Guía.', example: 'gaveta guide --topic comandos' },
];

const SAMPLE_CATALOG: SkillCliCatalog = {
  commands: new Set(SAMPLE_COMMANDS.map((entry) => entry.name)),
  subcommands: new Map(),
  globalFlags: new Set(['--json', '--vault', '--from']),
  flagsFor(): ReadonlySet<string> {
    return new Set([
      '--type',
      '--from',
      '--section',
      '--append',
      '--as',
      '--depth',
      '--topic',
      '--json',
    ]);
  },
};

describe('buildSkill', () => {
  it('emits Agent Skills front matter and the workflow agents need', () => {
    const bundle = buildSkill({ commands: SAMPLE_COMMANDS, cliVersion: '1.2.3' });
    const skill = bundle.files.find((file) => file.path === 'SKILL.md');
    expect(skill).toBeDefined();
    expect(skill?.contents).toContain('---');
    expect(skill?.contents).toContain(`name: ${SKILL_NAME}`);
    expect(skill?.contents).toContain('description:');
    expect(skill?.contents).toContain(`${SKILL_CLI_VERSION_FIELD}: 1.2.3`);
    for (const bullet of AGENT_WORKFLOW_BULLETS) {
      expect(skill?.contents).toContain(bullet);
    }
    for (const bullet of AGENT_VAULT_BULLETS) {
      expect(skill?.contents).toContain(bullet);
    }
    expect(skill?.contents).toContain('gaveta guide');
    expect(skill?.contents).not.toContain('<article>');
  });

  it('ships workflow and note-type references without duplicating the full guide', () => {
    const bundle = buildSkill({ commands: SAMPLE_COMMANDS, cliVersion: '0.0.0' });
    expect(bundle.files.map((file) => file.path)).toEqual([
      'SKILL.md',
      SKILL_REFERENCE_PATHS.workflow,
      SKILL_REFERENCE_PATHS.noteTypes,
    ]);
    const workflow = bundle.files.find((file) => file.path === SKILL_REFERENCE_PATHS.workflow);
    expect(workflow?.contents).toContain('gaveta search "sqlite" --json');
    expect(workflow?.contents).toContain('gaveta graph ref --depth 1 --json');
    const types = bundle.files.find((file) => file.path === SKILL_REFERENCE_PATHS.noteTypes);
    for (const type of NOTE_TYPES) {
      expect(types?.contents).toContain(`## ${type}`);
    }
    expect(types?.contents).toContain('gaveta guide --topic tipos');
  });
});

describe('findInvalidSkillMentions', () => {
  it('accepts registry examples and rejects unknown commands or flags', () => {
    const ok = findInvalidSkillMentions('Usa `gaveta search "x" --json`.', SAMPLE_CATALOG);
    expect(ok).toEqual([]);

    const badCommand = findInvalidSkillMentions('`gaveta imaginary --json`', SAMPLE_CATALOG);
    expect(badCommand).toHaveLength(1);
    expect(badCommand[0]?.message).toContain('unknown command');

    const badFlag = findInvalidSkillMentions('`gaveta search x --imaginary`', SAMPLE_CATALOG);
    expect(badFlag).toHaveLength(1);
    expect(badFlag[0]?.message).toContain('unknown flag');
  });
});
