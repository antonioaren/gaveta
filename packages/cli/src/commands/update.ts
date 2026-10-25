import { existsSync, realpathSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  applyGitUpdate,
  checkGitUpdate,
  defaultUpdateChannel,
  GavetaError,
  resolveInstallInfo,
  upgradeVaultAssets,
} from '@gaveta/core';
import type { CommandResult, CommandSpec, CommandWarning } from '../types.ts';
import { cliVersion } from './version.ts';

const CLI_ENTRY = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'bin', 'gaveta.js');

export const updateCommand: CommandSpec = {
  name: 'update',
  summary: 'cli.auto.actualiza_un_checkout_de_git_de_gaveta_y_refresc',
  example: 'gaveta update --check --json',
  requiresVault: false,
  skipsVaultDiscovery: false,
  input: 'none',
  options: [
    {
      name: 'check',
      flags: '--check',
      description: 'cli.auto.solo_comprueba_si_hay_una_actualizacion_disponib',
      kind: 'boolean',
    },
    {
      name: 'assetsOnly',
      flags: '--assets-only',
      description: 'cli.auto.solo_actualiza_los_assets_del_vault_sin_git_pull',
      kind: 'boolean',
    },
    {
      name: 'channel',
      flags: '--channel <canal>',
      description: 'cli.auto.canal_stable_ultimo_tag_v_o_main_rama_main',
      choices: ['stable', 'main'],
    },
  ],
  async run(context): Promise<CommandResult> {
    const assetsOnly = context.options.assetsOnly === 'true';
    if (assetsOnly) {
      if (context.vault === null) {
        return {
          human: 'Indica un vault con --vault para actualizar assets.\n',
          data: { error: 'missing_vault' },
          exitCode: 1,
        };
      }
      const vaultAssets = await upgradeVaultAssets(context.vault.root, cliVersion());
      const warnings: CommandWarning[] = vaultAssets.warnings.map((warning) => ({
        code: warning.code,
        params: { path: warning.path },
      }));
      const lines: string[] = [];
      if (vaultAssets.upgraded.length > 0) {
        lines.push(`Assets del vault actualizados: ${vaultAssets.upgraded.join(', ')}`);
      } else {
        lines.push('Los assets del vault ya están al día.');
      }
      return {
        human: `${lines.join('\n')}\n`,
        data: { assetsOnly: true, vaultAssets },
        ...(warnings.length > 0 ? { warnings } : {}),
      };
    }

    const install = await resolveInstallInfo(CLI_ENTRY);
    const updateRepoRoot = resolveUpdateRepoRoot(install.repoRoot);
    if (install.method !== 'git' || updateRepoRoot === null) {
      return manualUpdateResult(install.method);
    }
    const checkOnly = context.options.check === 'true';
    const channel =
      typeof context.options.channel === 'string'
        ? context.options.channel
        : defaultUpdateChannel(updateRepoRoot);
    const options = {
      repoRoot: updateRepoRoot,
      channel: channel as 'stable' | 'main',
      checkOnly,
    };
    const check = checkGitUpdate(options);
    if (checkOnly) {
      const human = formatCheckHuman(check, channel);
      const result: CommandResult = {
        human,
        data: {
          upToDate: check.upToDate,
          currentVersion: check.currentVersion,
          currentCommit: check.currentShortCommit,
          targetVersion: check.target?.version ?? null,
          targetCommit: check.target?.shortCommit ?? null,
          newCommits: check.target?.commitCount ?? 0,
          channel,
        },
        exitCode: check.upToDate ? 0 : 1,
      };
      return result;
    }
    const applied = await applyGitUpdate(options);
    const warnings: CommandWarning[] = [];
    let webBuildRan = false;
    if (applied.applied) {
      webBuildRan = runWebBuild(updateRepoRoot);
      if (!webBuildRan) {
        throw new GavetaError('E_UPDATE_FAILED');
      }
    }
    let vaultAssets: Awaited<ReturnType<typeof upgradeVaultAssets>> | null = null;
    if (applied.applied && context.vault !== null) {
      vaultAssets = await reexecVaultAssetUpgrade(
        install.repoRoot ?? updateRepoRoot,
        context.vault.root,
      );
      for (const warning of vaultAssets.warnings) {
        warnings.push({ code: warning.code, params: { path: warning.path } });
      }
    }
    const lines: string[] = [];
    if (applied.applied && applied.target !== null) {
      lines.push(
        `Actualizado: ${applied.previousVersion} (${check.currentShortCommit}) → ${applied.currentVersion} (${applied.currentShortCommit})`,
      );
      if (applied.target.commitCount > 0) {
        lines.push(`${String(applied.target.commitCount)} commit(s) nuevos en origin/main.`);
      }
      for (const entry of applied.target.changelogEntries) {
        lines.push(`\n## ${entry.version}\n${entry.body}`);
      }
      if (applied.pnpmInstallRan) {
        lines.push('\nDependencias actualizadas con pnpm install --frozen-lockfile.');
      }
      if (webBuildRan) {
        lines.push('Visor web compilado con pnpm build:web.');
      }
    } else if (check.upToDate) {
      lines.push(
        `Gaveta ${check.currentVersion} (${check.currentShortCommit}) ya está al día (${channel}).`,
      );
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
        webBuildRan,
      },
      ...(warnings.length > 0 ? { warnings } : {}),
    };
  },
};

function formatCheckHuman(check: ReturnType<typeof checkGitUpdate>, channel: string): string {
  if (check.upToDate) {
    return `Gaveta ${check.currentVersion} (${check.currentShortCommit}) está al día (${channel}).\n`;
  }
  const target = check.target;
  if (target === null) {
    return `Hay una actualización disponible.\n`;
  }
  const commits = target.commitCount > 0 ? `, ${String(target.commitCount)} commit(s) nuevos` : '';
  return `Hay una actualización disponible: ${check.currentVersion} (${check.currentShortCommit}) → ${target.version} (${target.shortCommit})${commits}.\n`;
}

function resolveUpdateRepoRoot(detectedRepoRoot: string | null): string | null {
  const override = process.env.GAVETA_UPDATE_REPO_ROOT?.trim();
  if (override !== undefined && override.length > 0) {
    try {
      return realpathSync(override);
    } catch {
      return null;
    }
  }
  return detectedRepoRoot;
}

async function reexecVaultAssetUpgrade(
  repoRoot: string,
  vaultRoot: string,
): Promise<Awaited<ReturnType<typeof upgradeVaultAssets>>> {
  const cli = join(repoRoot, 'packages', 'cli', 'bin', 'gaveta.js');
  const result = spawnSync(
    process.execPath,
    [cli, 'update', '--assets-only', '--json', '--vault', vaultRoot],
    { cwd: repoRoot, encoding: 'utf8' },
  );
  if (result.status !== 0) {
    throw new Error(
      `gaveta update --assets-only failed: ${result.stderr || result.stdout || 'unknown'}`,
    );
  }
  try {
    const payload = JSON.parse(result.stdout) as {
      data?: { vaultAssets?: Awaited<ReturnType<typeof upgradeVaultAssets>> };
    };
    if (payload.data?.vaultAssets !== undefined) {
      return payload.data.vaultAssets;
    }
  } catch {
    // fall through
  }
  return await upgradeVaultAssets(vaultRoot, cliVersion());
}

function runWebBuild(repoRoot: string): boolean {
  const webApp = join(repoRoot, 'apps', 'web', 'package.json');
  if (!existsSync(webApp)) {
    return true;
  }
  if (!existsSync(join(repoRoot, 'node_modules'))) {
    const install = spawnSync('pnpm', ['install', '--frozen-lockfile'], {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: 'pipe',
    });
    if ((install.status ?? 1) !== 0) {
      return false;
    }
  }
  const result = spawnSync('pnpm', ['build:web'], {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: 'pipe',
  });
  return (result.status ?? 1) === 0;
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
