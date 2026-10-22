import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  applyGitUpdate,
  checkGitUpdate,
  defaultUpdateChannel,
  resolveInstallInfo,
  upgradeVaultAssets,
  workspaceRootFromModuleUrl,
} from '@gaveta/core';
import type { CommandResult, CommandSpec, CommandWarning } from '../types.ts';
import { cliVersion } from './version.ts';

const CLI_ENTRY = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'bin', 'gaveta.js');

export const updateCommand: CommandSpec = {
  name: 'update',
  summary: 'Actualiza un checkout de git de Gaveta y refresca los assets del vault.',
  example: 'gaveta update --check --json',
  requiresVault: false,
  skipsVaultDiscovery: false,
  input: 'none',
  options: [
    {
      name: 'check',
      flags: '--check',
      description: 'Solo comprueba si hay una actualización disponible, sin modificar nada.',
      kind: 'boolean',
    },
    {
      name: 'channel',
      flags: '--channel <canal>',
      description: 'Canal stable (último tag v*) o main (rama main).',
      choices: ['stable', 'main'],
    },
  ],
  async run(context): Promise<CommandResult> {
    const install = await resolveInstallInfo(CLI_ENTRY);
    if (install.method !== 'git' || install.repoRoot === null) {
      return manualUpdateResult(install.method);
    }
    const checkOnly = context.options.check === 'true';
    const channel =
      typeof context.options.channel === 'string'
        ? context.options.channel
        : defaultUpdateChannel(install.repoRoot);
    const changelogMarkdown = readChangelog();
    const options = {
      repoRoot: install.repoRoot,
      channel: channel as 'stable' | 'main',
      checkOnly,
      changelogMarkdown,
    };
    const check = checkGitUpdate(options);
    if (checkOnly) {
      const human = check.upToDate
        ? `Gaveta ${check.currentVersion} está al día (${channel}).\n`
        : `Hay una actualización disponible: ${check.currentVersion} → ${check.target?.version ?? '?'}\n`;
      const result: CommandResult = {
        human,
        data: {
          upToDate: check.upToDate,
          currentVersion: check.currentVersion,
          targetVersion: check.target?.version ?? null,
          channel,
        },
        exitCode: check.upToDate ? 0 : 1,
      };
      return result;
    }
    const applied = await applyGitUpdate(options);
    const warnings: CommandWarning[] = [];
    let vaultAssets: Awaited<ReturnType<typeof upgradeVaultAssets>> | null = null;
    if (applied.applied && context.vault !== null) {
      vaultAssets = await upgradeVaultAssets(context.vault.root, cliVersion());
      for (const warning of vaultAssets.warnings) {
        warnings.push({ code: warning.code, params: { path: warning.path } });
      }
    }
    const lines: string[] = [];
    if (applied.applied && applied.target !== null) {
      lines.push(`Actualizado: ${applied.previousVersion} → ${applied.currentVersion}`);
      for (const entry of applied.target.changelogEntries) {
        lines.push(`\n## ${entry.version}\n${entry.body}`);
      }
      if (applied.pnpmInstallRan) {
        lines.push('\nDependencias actualizadas con pnpm install --frozen-lockfile.');
      }
    } else if (check.upToDate) {
      lines.push(`Gaveta ${check.currentVersion} ya está al día (${channel}).`);
    }
    if (vaultAssets !== null && vaultAssets.upgraded.length > 0) {
      lines.push(`Assets del vault actualizados: ${vaultAssets.upgraded.join(', ')}`);
    }
    return {
      human: `${lines.join('\n')}\n`,
      data: {
        ...applied,
        channel,
        vaultAssets,
      },
      ...(warnings.length > 0 ? { warnings } : {}),
    };
  },
};

function readChangelog(): string {
  const root = workspaceRootFromModuleUrl(import.meta.url);
  return readFileSync(join(root, 'CHANGELOG.md'), 'utf8');
}

function manualUpdateResult(method: string): CommandResult {
  const lines = [
    'Esta instalación no admite gaveta update automático.',
    '',
    'Instalación desde git (recomendada hoy):',
    '  cd <checkout-de-gaveta>',
    '  git switch main && git pull --ff-only origin main',
    '  pnpm install --frozen-lockfile',
    '  ln -sf "$(pwd)/packages/cli/bin/gaveta.js" ~/.local/bin/gaveta',
    '  ln -sf "$(pwd)/packages/cli/bin/gaveta.js" ~/.local/bin/gv',
    '',
    `Método detectado: ${method}.`,
  ];
  return {
    human: `${lines.join('\n')}\n`,
    data: { manual: true, method },
    exitCode: 1,
  };
}
