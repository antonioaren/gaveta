import { GavetaError, GUIDE_TOPICS, buildGuide, type GuideCommandEntry } from '@gaveta/core';
import type { CommandContext, CommandResult, CommandSpec } from '../types.ts';

export function guideCommandsFromRegistry(registry: readonly CommandSpec[]): GuideCommandEntry[] {
  return registry.map((command) => ({
    name: command.name,
    summary: command.summary,
    example: command.example,
    ...(command.subcommands === undefined
      ? {}
      : {
          subcommands: command.subcommands.map((sub) => ({
            name: sub.name,
            summary: sub.summary,
            example: sub.example,
          })),
        }),
  }));
}

const GUIDE_OPTIONS = [
  {
    name: 'topic',
    flags: '--topic <tema>',
    description: `Sección a mostrar: ${GUIDE_TOPICS.join(', ')}.`,
    choices: [...GUIDE_TOPICS],
  },
  {
    name: 'errors',
    flags: '--errors',
    description: 'cli.auto.muestra_solo_el_catalogo_de_errores_y_avisos',
    kind: 'boolean' as const,
  },
];

export function createGuideCommand(peers: readonly CommandSpec[]): CommandSpec {
  const spec: CommandSpec = {
    name: 'guide',
    summary: 'cli.auto.imprime_el_contrato_de_autoria_los_comandos_y_el',
    example: 'gaveta guide --topic tipos',
    requiresVault: false,
    input: 'none',
    options: GUIDE_OPTIONS,
    run(context: CommandContext): CommandResult {
      const topic = context.options.topic;
      const errorsOnly = context.options.errors === 'true';
      if (topic !== undefined && errorsOnly) {
        throw new GavetaError('E_ARG_INVALID');
      }
      try {
        const guide = buildGuide({
          commands: guideCommandsFromRegistry([...peers, spec]),
          ...(topic !== undefined ? { topic } : {}),
          ...(errorsOnly ? { errorsOnly: true } : {}),
        });
        return {
          human: guide.human,
          data: guide.data,
        };
      } catch (error) {
        if (error instanceof Error && error.message === 'E_ARG_INVALID') {
          throw new GavetaError('E_ARG_INVALID');
        }
        throw error;
      }
    },
  };
  return spec;
}
