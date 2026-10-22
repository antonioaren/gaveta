import { GAVETA_VAULT_ENV } from './constants.ts';

export interface ResolveInitDirectoryOptions {
  readonly positional?: string;
  readonly vaultOption?: string;
  readonly env?: NodeJS.ProcessEnv;
}

/**
 * Target directory for `gaveta init`.
 * Precedence: positional dir > --vault > GAVETA_VAULT > cwd (handled by initVault).
 */
export function resolveInitDirectory(options: ResolveInitDirectoryOptions): string | undefined {
  if (options.positional !== undefined) {
    return options.positional;
  }
  if (options.vaultOption !== undefined) {
    return options.vaultOption;
  }
  const env = options.env ?? process.env;
  const configured = env[GAVETA_VAULT_ENV];
  if (typeof configured === 'string' && configured.length > 0) {
    return configured;
  }
  return undefined;
}
