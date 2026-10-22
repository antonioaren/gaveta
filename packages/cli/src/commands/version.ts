import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CommandResult, CommandSpec } from '../types.ts';

let cachedVersion: string | undefined;

export function cliVersion(): string {
  if (cachedVersion !== undefined) {
    return cachedVersion;
  }
  const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
  const manifest: unknown = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8'));
  if (!isRecord(manifest) || typeof manifest.version !== 'string') {
    throw new Error('CLI package.json has no version');
  }
  cachedVersion = manifest.version;
  return cachedVersion;
}

export const versionCommand: CommandSpec = {
  name: 'version',
  summary: 'Muestra la versión de gaveta.',
  example: 'gaveta version --json',
  requiresVault: false,
  input: 'optional',
  run(context): CommandResult {
    const version = cliVersion();
    return {
      human: `gaveta ${version}\n`,
      data: {
        name: 'gaveta',
        version,
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
