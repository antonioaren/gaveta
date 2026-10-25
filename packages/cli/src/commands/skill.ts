import { GavetaError, skillInstall, skillStatus, type SkillLocationReport } from '@gaveta/core';
import type { CommandContext, CommandResult, CommandSpec, CommandWarning } from '../types.ts';
import { cliVersion } from './version.ts';
import { createGuideCommand, guideCommandsFromRegistry } from './guide.ts';
import type { CommandSpec as RegistryCommand } from '../types.ts';

function homeDirectory(env: NodeJS.ProcessEnv): string {
  const configured = env.HOME ?? env.USERPROFILE;
  if (typeof configured !== 'string' || configured.length === 0) {
    throw new GavetaError('E_SKILL_PATH');
  }
  return configured;
}

function statusWarnings(locations: readonly SkillLocationReport[]): CommandWarning[] {
  const warnings: CommandWarning[] = [];
  for (const location of locations) {
    if (location.state === 'outdated') {
      warnings.push({ code: 'W_SKILL_OUTDATED' });
    }
  }
  return warnings;
}

function renderStatusHuman(locations: readonly SkillLocationReport[]): string {
  const lines = ['Estado de la skill de Gaveta:', ''];
  for (const location of locations) {
    const label = `${location.target} (${location.scope})`;
    switch (location.state) {
      case 'missing':
        lines.push(`- ${label}: no instalada en ${location.directory}.`);
        break;
      case 'current':
        lines.push(`- ${label}: al día en ${location.directory}.`);
        break;
      case 'outdated':
        lines.push(
          `- ${label}: desfasada (${location.installedVersion ?? 'sin versión'} < ${location.cliVersion}) en ${location.directory}.`,
        );
        break;
      case 'modified':
        lines.push(`- ${label}: modificada manualmente en ${location.directory}.`);
        break;
      default:
        break;
    }
  }
  return `${lines.join('\n')}\n`;
}

function renderInstallHuman(result: {
  readonly written: readonly string[];
  readonly skipped: readonly string[];
  readonly dryRun: boolean;
}): string {
  if (result.dryRun) {
    if (result.written.length === 0) {
      return 'No se escribiría ningún archivo.\n';
    }
    return `Se escribirían:\n${result.written.map((path) => `- ${path}`).join('\n')}\n`;
  }
  const lines: string[] = [];
  if (result.written.length > 0) {
    lines.push('Skill instalada:');
    for (const path of result.written) {
      lines.push(`- ${path}`);
    }
  }
  if (result.skipped.length > 0) {
    lines.push('Sin cambios:');
    for (const path of result.skipped) {
      lines.push(`- ${path}`);
    }
  }
  if (lines.length === 0) {
    return 'La skill ya estaba al día.\n';
  }
  return `${lines.join('\n')}\n`;
}

export function createSkillCommand(registry: readonly RegistryCommand[]): CommandSpec {
  const guideSpec = createGuideCommand(registry);
  const commands = guideCommandsFromRegistry([...registry, guideSpec]);
  return {
    name: 'skill',
    summary: 'cli.auto.instala_o_comprueba_la_skill_de_gaveta_para_cada',
    example: 'gaveta skill install --target cursor --dry-run --json',
    requiresVault: false,
    skipsVaultDiscovery: true,
    input: 'none',
    subcommands: [
      {
        name: 'install',
        summary: 'cli.auto.copia_la_skill_generada_al_directorio_que_lee_ca',
        example: 'gaveta skill install --target cursor --scope project --json',
        options: [
          {
            name: 'target',
            flags: '--target <agente>',
            description: 'cli.auto.agente_destino_claude_cursor_codex_copilot_o_all',
            choices: ['claude', 'cursor', 'codex', 'copilot', 'all'],
          },
          {
            name: 'scope',
            flags: '--scope <ámbito>',
            description: 'cli.auto.instala_en_el_proyecto_project_o_en_el_usuario_u',
            choices: ['project', 'user'],
          },
          {
            name: 'dryRun',
            flags: '--dry-run',
            description: 'cli.auto.lista_las_rutas_que_se_escribirian_sin_modificar',
            kind: 'boolean',
          },
          {
            name: 'force',
            flags: '--force',
            description: 'cli.auto.sobrescribe_una_skill_modificada_manualmente',
            kind: 'boolean',
          },
        ],
        async run(context: CommandContext): Promise<CommandResult> {
          const target = context.options.target;
          if (target === undefined) {
            throw new GavetaError('E_ARG_INVALID');
          }
          const result = await skillInstall({
            cwd: context.cwd,
            home: homeDirectory(context.env),
            target,
            ...(context.options.scope !== undefined ? { scope: context.options.scope } : {}),
            dryRun: context.options.dryRun === 'true',
            force: context.options.force === 'true',
            cliVersion: cliVersion(),
            commands,
          });
          return {
            data: result,
            human: renderInstallHuman({
              written: result.written,
              skipped: result.skipped,
              dryRun: context.options.dryRun === 'true',
            }),
          };
        },
      },
      {
        name: 'status',
        summary: 'cli.auto.comprueba_si_la_skill_instalada_coincide_con_est',
        example: 'gaveta skill status --target all --json',
        options: [
          {
            name: 'target',
            flags: '--target <agente>',
            description: 'cli.auto.agente_a_comprobar_por_defecto_all',
            choices: ['claude', 'cursor', 'codex', 'copilot', 'all'],
          },
          {
            name: 'scope',
            flags: '--scope <ámbito>',
            description: 'cli.auto.comprueba_la_copia_del_proyecto_o_del_usuario',
            choices: ['project', 'user'],
          },
        ],
        async run(context: CommandContext): Promise<CommandResult> {
          const result = await skillStatus({
            cwd: context.cwd,
            home: homeDirectory(context.env),
            ...(context.options.target !== undefined ? { target: context.options.target } : {}),
            ...(context.options.scope !== undefined ? { scope: context.options.scope } : {}),
            cliVersion: cliVersion(),
            commands,
          });
          const warnings = statusWarnings(result.locations);
          return {
            data: result,
            human: renderStatusHuman(result.locations),
            ...(warnings.length > 0 ? { warnings } : {}),
          };
        },
      },
    ],
  };
}
