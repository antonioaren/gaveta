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
    summary: 'Instala o comprueba la skill de Gaveta para cada agente.',
    example: 'gaveta skill install --target cursor --dry-run --json',
    requiresVault: false,
    skipsVaultDiscovery: true,
    input: 'none',
    subcommands: [
      {
        name: 'install',
        summary: 'Copia la skill generada al directorio que lee cada agente.',
        example: 'gaveta skill install --target cursor --scope project --json',
        options: [
          {
            name: 'target',
            flags: '--target <agente>',
            description: 'Agente destino: claude, cursor, codex, copilot o all.',
            choices: ['claude', 'cursor', 'codex', 'copilot', 'all'],
          },
          {
            name: 'scope',
            flags: '--scope <ámbito>',
            description: 'Instala en el proyecto (project) o en el usuario (user).',
            choices: ['project', 'user'],
          },
          {
            name: 'dryRun',
            flags: '--dry-run',
            description: 'Lista las rutas que se escribirían sin modificar archivos.',
            kind: 'boolean',
          },
          {
            name: 'force',
            flags: '--force',
            description: 'Sobrescribe una skill modificada manualmente.',
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
        summary: 'Comprueba si la skill instalada coincide con esta CLI.',
        example: 'gaveta skill status --target all --json',
        options: [
          {
            name: 'target',
            flags: '--target <agente>',
            description: 'Agente a comprobar (por defecto, all).',
            choices: ['claude', 'cursor', 'codex', 'copilot', 'all'],
          },
          {
            name: 'scope',
            flags: '--scope <ámbito>',
            description: 'Comprueba la copia del proyecto o del usuario.',
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
