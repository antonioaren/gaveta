import { readWorkspaceVersion, resolveInstallInfo } from '@gaveta/core';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CommandResult, CommandSpec } from '../types.ts';

let cachedVersion: string | undefined;

export function cliVersion(): string {
  if (cachedVersion !== undefined) {
    return cachedVersion;
  }
  cachedVersion = readWorkspaceVersion();
  return cachedVersion;
}

const CLI_ENTRY = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'bin', 'gaveta.js');

export const versionCommand: CommandSpec = {
  name: 'version',
  summary: 'Muestra la versión de gaveta.',
  example: 'gaveta version --json',
  requiresVault: false,
  input: 'optional',
  async run(context): Promise<CommandResult> {
    const version = cliVersion();
    const install = await resolveInstallInfo(CLI_ENTRY);
    const humanParts = [`gaveta ${version}`];
    if (install.git !== null) {
      const dirty = install.git.dirty ? ' (dirty)' : '';
      humanParts.push(`git ${install.git.shortCommit}${dirty}`);
    }
    humanParts.push(`node ${install.nodeVersion}`);
    humanParts.push(`install ${install.method}`);
    return {
      human: `${humanParts.join(' · ')}\n`,
      data: {
        name: 'gaveta',
        version,
        install: {
          method: install.method,
          nodeVersion: install.nodeVersion,
          repoRoot: install.repoRoot,
          git: install.git,
        },
        vault:
          context.vault === null
            ? null
            : { root: context.vault.root, source: context.vault.source },
        input:
          context.input === null
            ? null
            : {
                source: context.input.source,
                bytes: context.input.bytes,
                sha256: context.input.sha256,
              },
      },
    };
  },
};
