import { lstat, mkdir, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { GavetaError } from '../errors.ts';
import { openVaultIndex } from '../sqlite/store.ts';
import { DEFAULT_THEME_CSS } from '../theme/theme.ts';
import {
  agentInstructionRelativePath,
  expandAgentInstructionTargets,
  isAgentInstructionTarget,
  mergeAgentInstructionFile,
  type AgentInstructionTarget,
} from './agent-instructions.ts';
import { createDefaultVaultConfig, writeVaultConfig } from './config.ts';
import { GAVETA_DIRECTORY, VAULT_CONFIG_PATH } from './constants.ts';
import { pathOutsideVault } from './errors.ts';
import { hasNodeErrorCode } from './node-error.ts';
import { isInsideVault, readVaultText, writeVaultText } from './paths.ts';

const THEME_RELATIVE_PATH = `${GAVETA_DIRECTORY}/theme.css`;
const INDEX_RELATIVE_PATH = `${GAVETA_DIRECTORY}/index.sqlite`;

const VAULT_FILES = [VAULT_CONFIG_PATH, THEME_RELATIVE_PATH, INDEX_RELATIVE_PATH] as const;

export interface InitVaultOptions {
  readonly cwd: string;
  readonly directory?: string;
  readonly agentInstructions?: string;
}

export interface AgentInstructionResult {
  readonly target: Exclude<AgentInstructionTarget, 'all'>;
  readonly path: string;
  readonly changed: boolean;
}

export interface InitVaultResult {
  readonly root: string;
  readonly created: readonly string[];
  readonly preserved: readonly string[];
  readonly agentInstructions: readonly AgentInstructionResult[];
}

interface FilePlan {
  readonly relative: string;
  readonly exists: boolean;
}

/**
 * Create `.gaveta/` with default config, theme, and an empty index.
 * Files that already exist are left byte-for-byte, including notes.
 */
export async function initVault(options: InitVaultOptions): Promise<InitVaultResult> {
  const target = readAgentTarget(options.agentInstructions);
  const root = await resolveInitRoot(options.cwd, options.directory);
  await assertGavetaMarker(root);
  const plans = await planVaultFiles(root);
  await ensureGavetaDirectory(root);
  const created: string[] = [];
  const preserved: string[] = [];
  for (const plan of plans) {
    if (plan.exists) {
      preserved.push(plan.relative);
      continue;
    }
    await writeMissing(root, plan.relative);
    created.push(plan.relative);
  }
  const agentInstructions =
    target === null ? [] : await writeAgentFiles(root, expandAgentInstructionTargets(target));
  return { root, created, preserved, agentInstructions };
}

function readAgentTarget(value: string | undefined): AgentInstructionTarget | null {
  if (value === undefined) {
    return null;
  }
  if (isAgentInstructionTarget(value)) {
    return value;
  }
  throw new GavetaError('E_ARG_INVALID');
}

async function resolveInitRoot(cwd: string, directory: string | undefined): Promise<string> {
  if (!isSafePathInput(cwd) || (directory !== undefined && !isSafePathInput(directory))) {
    throw new GavetaError('E_ARG_INVALID');
  }
  if (directory?.length === 0) {
    throw new GavetaError('E_ARG_INVALID');
  }
  let start: string;
  try {
    start = await realpath(cwd);
  } catch (error) {
    if (
      hasNodeErrorCode(error, 'ENOENT') ||
      hasNodeErrorCode(error, 'ENOTDIR') ||
      hasNodeErrorCode(error, 'ELOOP')
    ) {
      throw new GavetaError('E_ARG_INVALID');
    }
    throw error;
  }
  const absolute = path.resolve(start, directory ?? '.');
  const fsRoot = path.parse(absolute).root;
  const segments = absolute
    .slice(fsRoot.length)
    .split(path.sep)
    .filter((segment) => segment.length > 0);
  let current = fsRoot;
  for (const segment of segments) {
    if (segment === '..') {
      throw pathOutsideVault();
    }
    const next = path.join(current, segment);
    const listed = await lstatOrNull(next);
    if (listed === null) {
      try {
        await mkdir(next);
      } catch (error) {
        if (!hasNodeErrorCode(error, 'EEXIST')) {
          throw error;
        }
      }
      const created = await lstat(next);
      if (created.isSymbolicLink() || !created.isDirectory()) {
        throw pathOutsideVault();
      }
      current = next;
      continue;
    }
    if (listed.isSymbolicLink()) {
      const real = await realOrOutside(next);
      const parentReal = await realpath(path.dirname(next));
      if (!isInsideVault(parentReal, real)) {
        throw pathOutsideVault();
      }
      const info = await stat(real);
      if (!info.isDirectory()) {
        throw new GavetaError('E_PATH_EXISTS');
      }
      current = real;
      continue;
    }
    if (!listed.isDirectory()) {
      throw new GavetaError('E_PATH_EXISTS');
    }
    current = next;
  }
  return current;
}

async function assertGavetaMarker(root: string): Promise<void> {
  const marker = path.join(root, GAVETA_DIRECTORY);
  const listed = await lstatOrNull(marker);
  if (listed === null) {
    return;
  }
  if (listed.isSymbolicLink()) {
    throw pathOutsideVault();
  }
  if (!listed.isDirectory()) {
    throw new GavetaError('E_PATH_EXISTS');
  }
}

async function ensureGavetaDirectory(root: string): Promise<void> {
  const marker = path.join(root, GAVETA_DIRECTORY);
  if ((await lstatOrNull(marker)) !== null) {
    return;
  }
  await mkdir(marker);
  const created = await lstat(marker);
  if (created.isSymbolicLink() || !created.isDirectory()) {
    throw pathOutsideVault();
  }
}

async function planVaultFiles(root: string): Promise<FilePlan[]> {
  const plans: FilePlan[] = [];
  for (const relative of VAULT_FILES) {
    const absolute = path.join(root, ...relative.split('/'));
    if (!isInsideVault(root, absolute)) {
      throw pathOutsideVault();
    }
    const listed = await lstatOrNull(absolute);
    if (listed === null) {
      plans.push({ relative, exists: false });
      continue;
    }
    if (listed.isSymbolicLink()) {
      const real = await realOrOutside(absolute);
      if (!isInsideVault(root, real)) {
        throw pathOutsideVault();
      }
      plans.push({ relative, exists: true });
      continue;
    }
    if (!listed.isFile()) {
      throw new GavetaError('E_PATH_EXISTS');
    }
    plans.push({ relative, exists: true });
  }
  return plans;
}

async function writeMissing(root: string, relative: string): Promise<void> {
  if (relative === VAULT_CONFIG_PATH) {
    await writeVaultConfig(root, createDefaultVaultConfig());
    return;
  }
  if (relative === THEME_RELATIVE_PATH) {
    await writeVaultText(root, relative, DEFAULT_THEME_CSS);
    return;
  }
  const index = await openVaultIndex(root);
  index.close();
}

async function writeAgentFiles(
  root: string,
  targets: readonly Exclude<AgentInstructionTarget, 'all'>[],
): Promise<AgentInstructionResult[]> {
  const results: AgentInstructionResult[] = [];
  for (const target of targets) {
    const relative = agentInstructionRelativePath(target);
    const absolute = path.join(root, relative);
    let existing = '';
    if ((await lstatOrNull(absolute)) !== null) {
      existing = await readVaultText(root, relative);
    }
    const next = mergeAgentInstructionFile(target, existing);
    if (next !== existing) {
      await mkdir(path.dirname(absolute), { recursive: true });
      await writeVaultText(root, relative, next);
    }
    results.push({ target, path: relative, changed: next !== existing });
  }
  return results;
}

function isSafePathInput(value: string): boolean {
  return value.length > 0 && !value.includes('\0');
}

async function lstatOrNull(target: string): Promise<Awaited<ReturnType<typeof lstat>> | null> {
  try {
    return await lstat(target);
  } catch (error) {
    if (hasNodeErrorCode(error, 'ENOENT')) {
      return null;
    }
    if (hasNodeErrorCode(error, 'ENOTDIR') || hasNodeErrorCode(error, 'ELOOP')) {
      throw pathOutsideVault();
    }
    throw error;
  }
}

async function realOrOutside(target: string): Promise<string> {
  try {
    return await realpath(target);
  } catch (error) {
    if (
      hasNodeErrorCode(error, 'ENOENT') ||
      hasNodeErrorCode(error, 'ELOOP') ||
      hasNodeErrorCode(error, 'ENOTDIR')
    ) {
      throw pathOutsideVault();
    }
    throw error;
  }
}
