import { lstat, mkdir, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { GavetaError } from './errors.ts';
import type { GuideCommandEntry } from './guide.ts';
import { parseNodeVersion } from './runtime.ts';
import { SKILL_CLI_VERSION_FIELD, buildSkill, type SkillBundle, type SkillFile } from './skill.ts';
import { writeAtomic } from './vault/atomic.ts';
import { hasNodeErrorCode } from './vault/node-error.ts';
import { isInsideVault } from './vault/paths.ts';

export const SKILL_TARGETS = ['claude', 'cursor', 'codex', 'copilot', 'all'] as const;

export type SkillTarget = (typeof SKILL_TARGETS)[number];

export const SKILL_SCOPES = ['project', 'user'] as const;

export type SkillScope = (typeof SKILL_SCOPES)[number];

export type SkillInstallState = 'missing' | 'current' | 'outdated' | 'modified';

export interface SkillInstallOptions {
  readonly cwd: string;
  readonly home: string;
  readonly target: string;
  readonly scope?: string;
  readonly dryRun?: boolean;
  readonly force?: boolean;
  readonly cliVersion: string;
  readonly commands: readonly GuideCommandEntry[];
}

export interface SkillStatusOptions {
  readonly cwd: string;
  readonly home: string;
  readonly target?: string;
  readonly scope?: string;
  readonly cliVersion: string;
  readonly commands: readonly GuideCommandEntry[];
}

export interface SkillLocationReport {
  readonly target: Exclude<SkillTarget, 'all'>;
  readonly scope: SkillScope;
  readonly directory: string;
  readonly state: SkillInstallState;
  readonly installedVersion: string | null;
  readonly cliVersion: string;
}

export interface SkillInstallResult {
  readonly bundle: SkillBundle;
  readonly locations: readonly SkillLocationReport[];
  readonly written: readonly string[];
  readonly skipped: readonly string[];
}

export interface SkillStatusResult {
  readonly bundle: SkillBundle;
  readonly locations: readonly SkillLocationReport[];
}

export function isSkillTarget(value: string): value is SkillTarget {
  for (const target of SKILL_TARGETS) {
    if (target === value) {
      return true;
    }
  }
  return false;
}

export function isSkillScope(value: string): value is SkillScope {
  for (const scope of SKILL_SCOPES) {
    if (scope === value) {
      return true;
    }
  }
  return false;
}

export function expandSkillTargets(target: SkillTarget): readonly Exclude<SkillTarget, 'all'>[] {
  if (target === 'all') {
    return ['claude', 'cursor', 'codex', 'copilot'];
  }
  return [target];
}

export function skillDirectoryRelative(target: Exclude<SkillTarget, 'all'>): string {
  switch (target) {
    case 'claude':
      return '.claude/skills/gaveta';
    case 'cursor':
      return '.cursor/skills/gaveta';
    case 'codex':
      return '.agents/skills/gaveta';
    case 'copilot':
      return '.github/skills/gaveta';
  }
}

export function compareCliVersions(left: string, right: string): number {
  const [lMajor, lMinor, lPatch] = parseNodeVersion(left);
  const [rMajor, rMinor, rPatch] = parseNodeVersion(right);
  if (lMajor !== rMajor) {
    return lMajor < rMajor ? -1 : 1;
  }
  if (lMinor !== rMinor) {
    return lMinor < rMinor ? -1 : 1;
  }
  if (lPatch !== rPatch) {
    return lPatch < rPatch ? -1 : 1;
  }
  return 0;
}

export function parseInstalledSkillVersion(skillMarkdown: string): string | null {
  const match = new RegExp(`^${SKILL_CLI_VERSION_FIELD}:\\s*([^\\n]+)`, 'm').exec(skillMarkdown);
  if (match === null) {
    return null;
  }
  const raw = match[1]?.trim() ?? '';
  if (raw.startsWith("'") && raw.endsWith("'")) {
    return raw.slice(1, -1);
  }
  if (raw.startsWith('"') && raw.endsWith('"')) {
    return raw.slice(1, -1);
  }
  return raw;
}

export async function skillStatus(options: SkillStatusOptions): Promise<SkillStatusResult> {
  const scope = readSkillScope(options.scope);
  const target = readSkillStatusTarget(options.target);
  const bundle = buildSkill({ commands: options.commands, cliVersion: options.cliVersion });
  const locations: SkillLocationReport[] = [];
  for (const agent of expandSkillTargets(target)) {
    locations.push(
      await inspectLocation({
        cwd: options.cwd,
        home: options.home,
        target: agent,
        scope,
        bundle,
        cliVersion: options.cliVersion,
      }),
    );
  }
  return { bundle, locations };
}

export async function skillInstall(options: SkillInstallOptions): Promise<SkillInstallResult> {
  const scope = readSkillScope(options.scope);
  const target = readSkillInstallTarget(options.target);
  const bundle = buildSkill({ commands: options.commands, cliVersion: options.cliVersion });
  const locations: SkillLocationReport[] = [];
  const written: string[] = [];
  const skipped: string[] = [];

  for (const agent of expandSkillTargets(target)) {
    const report = await inspectLocation({
      cwd: options.cwd,
      home: options.home,
      target: agent,
      scope,
      bundle,
      cliVersion: options.cliVersion,
    });
    locations.push(report);
    if (report.state === 'current') {
      skipped.push(report.directory);
      continue;
    }
    if (report.state === 'modified' && options.force !== true) {
      throw new GavetaError('E_SKILL_MODIFIED');
    }
    const files = await planWrites({
      cwd: options.cwd,
      home: options.home,
      scope,
      directory: report.directory,
      bundle,
      dryRun: options.dryRun === true,
    });
    for (const file of files) {
      written.push(file);
    }
  }

  return { bundle, locations, written, skipped };
}

function readSkillScope(value: string | undefined): SkillScope {
  if (value === undefined) {
    return 'project';
  }
  if (isSkillScope(value)) {
    return value;
  }
  throw new GavetaError('E_ARG_INVALID');
}

function readSkillInstallTarget(value: string): SkillTarget {
  if (isSkillTarget(value)) {
    return value;
  }
  throw new GavetaError('E_ARG_INVALID');
}

function readSkillStatusTarget(value: string | undefined): SkillTarget {
  if (value === undefined) {
    return 'all';
  }
  return readSkillInstallTarget(value);
}

async function inspectLocation(input: {
  readonly cwd: string;
  readonly home: string;
  readonly target: Exclude<SkillTarget, 'all'>;
  readonly scope: SkillScope;
  readonly bundle: SkillBundle;
  readonly cliVersion: string;
}): Promise<SkillLocationReport> {
  const directory = skillDirectoryRelative(input.target);
  const anchor = await resolveAnchor(input.cwd, input.home, input.scope);
  const installed = await readInstalledBundle(anchor, directory, input.bundle.files);
  const state = classifyInstallState(installed, input.bundle, input.cliVersion);
  return {
    target: input.target,
    scope: input.scope,
    directory,
    state,
    installedVersion: installed.version,
    cliVersion: input.cliVersion,
  };
}

interface InstalledBundle {
  readonly version: string | null;
  readonly files: Map<string, string>;
  readonly complete: boolean;
}

async function readInstalledBundle(
  anchor: string,
  directory: string,
  expectedFiles: readonly SkillFile[],
): Promise<InstalledBundle> {
  const files = new Map<string, string>();
  let version: string | null = null;
  let complete = true;
  for (const expected of expectedFiles) {
    const relative = path.posix.join(directory, expected.path);
    const absolute = await resolveInsideAnchor(anchor, relative);
    try {
      const contents = await readFile(absolute, 'utf8');
      files.set(expected.path, contents);
      if (expected.path === 'SKILL.md' && version === null) {
        version = parseInstalledSkillVersion(contents);
      }
    } catch (error) {
      if (hasNodeErrorCode(error, 'ENOENT')) {
        complete = false;
        continue;
      }
      throw error;
    }
  }
  return { version, files, complete };
}

function classifyInstallState(
  installed: InstalledBundle,
  bundle: SkillBundle,
  cliVersion: string,
): SkillInstallState {
  if (!installed.complete || installed.files.size === 0) {
    return 'missing';
  }
  if (bundleMatches(installed.files, bundle.files)) {
    return 'current';
  }
  if (installed.version !== null && compareCliVersions(installed.version, cliVersion) < 0) {
    return 'outdated';
  }
  return 'modified';
}

function bundleMatches(onDisk: Map<string, string>, expected: readonly SkillFile[]): boolean {
  for (const file of expected) {
    if (onDisk.get(file.path) !== file.contents) {
      return false;
    }
  }
  return true;
}

async function planWrites(input: {
  readonly cwd: string;
  readonly home: string;
  readonly scope: SkillScope;
  readonly directory: string;
  readonly bundle: SkillBundle;
  readonly dryRun: boolean;
}): Promise<string[]> {
  const anchor = await resolveAnchor(input.cwd, input.home, input.scope);
  const written: string[] = [];
  for (const file of input.bundle.files) {
    const relative = path.posix.join(input.directory, file.path);
    const absolute = await resolveInsideAnchor(anchor, relative);
    if (!input.dryRun) {
      await mkdir(path.dirname(absolute), { recursive: true });
      await writeAtomic(absolute, file.contents);
    }
    written.push(relative);
  }
  return written;
}

async function resolveAnchor(cwd: string, home: string, scope: SkillScope): Promise<string> {
  const base = scope === 'user' ? home : cwd;
  return await realDirectory(base);
}

async function realDirectory(target: string): Promise<string> {
  if (!isSafePathInput(target)) {
    throw new GavetaError('E_SKILL_PATH');
  }
  try {
    return await realpath(target);
  } catch (error) {
    if (
      hasNodeErrorCode(error, 'ENOENT') ||
      hasNodeErrorCode(error, 'ENOTDIR') ||
      hasNodeErrorCode(error, 'ELOOP')
    ) {
      throw new GavetaError('E_SKILL_PATH');
    }
    throw error;
  }
}

export async function resolveInsideAnchor(anchor: string, userPath: string): Promise<string> {
  if (!isSafePathInput(userPath)) {
    throw new GavetaError('E_SKILL_PATH');
  }
  const root = await realDirectory(anchor);
  const segments = splitSegments(userPath);
  let current = root;
  let entered = true;
  let lexical = false;

  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    if (segment === undefined) {
      continue;
    }
    const isLast = index === segments.length - 1;
    if (segment === '..') {
      const parent = path.dirname(current);
      if (entered && !isInsideVault(root, parent)) {
        throw new GavetaError('E_SKILL_PATH');
      }
      current = parent;
      entered = isInsideVault(root, current);
      continue;
    }
    if (lexical) {
      const next = path.join(current, segment);
      if (entered && !isInsideVault(root, next)) {
        throw new GavetaError('E_SKILL_PATH');
      }
      current = next;
      entered = isInsideVault(root, current);
      continue;
    }

    const next = path.join(current, segment);
    const listed = await lstatOrNull(next);
    if (listed === null) {
      if (entered && !isInsideVault(root, next)) {
        throw new GavetaError('E_SKILL_PATH');
      }
      lexical = true;
      current = next;
      entered = isInsideVault(root, current);
      continue;
    }
    if (listed.isSymbolicLink()) {
      const resolved = await followLink(root, next, isLast, entered);
      current = resolved.current;
      entered = resolved.entered;
      continue;
    }
    if (!isLast && !listed.isDirectory()) {
      throw new GavetaError('E_SKILL_PATH');
    }
    const real = await realOrThrow(next);
    if (entered && !isInsideVault(root, real)) {
      throw new GavetaError('E_SKILL_PATH');
    }
    current = real;
    entered = isInsideVault(root, current);
  }

  if (!isInsideVault(root, current)) {
    throw new GavetaError('E_SKILL_PATH');
  }
  return current;
}

function isSafePathInput(value: string): boolean {
  return value.length > 0 && !value.includes('\0');
}

function splitSegments(userPath: string): string[] {
  const normalized = userPath.replaceAll('\\', '/');
  return normalized.split('/').filter((segment) => segment.length > 0 && segment !== '.');
}

async function lstatOrNull(target: string): Promise<Awaited<ReturnType<typeof lstat>> | null> {
  try {
    return await lstat(target);
  } catch (error) {
    if (hasNodeErrorCode(error, 'ENOENT')) {
      return null;
    }
    if (hasNodeErrorCode(error, 'ENOTDIR') || hasNodeErrorCode(error, 'ELOOP')) {
      throw new GavetaError('E_SKILL_PATH');
    }
    throw error;
  }
}

async function realOrThrow(target: string): Promise<string> {
  try {
    return await realpath(target);
  } catch (error) {
    if (
      hasNodeErrorCode(error, 'ENOENT') ||
      hasNodeErrorCode(error, 'ELOOP') ||
      hasNodeErrorCode(error, 'ENOTDIR')
    ) {
      throw new GavetaError('E_SKILL_PATH');
    }
    throw error;
  }
}

async function followLink(
  root: string,
  linkPath: string,
  isLast: boolean,
  entered: boolean,
): Promise<{ readonly current: string; readonly entered: boolean }> {
  const resolved = await realOrThrow(linkPath);
  if (entered && !isInsideVault(root, resolved)) {
    throw new GavetaError('E_SKILL_PATH');
  }
  if (!isLast) {
    const info = await lstatOrNull(resolved);
    if (info !== null && !info.isDirectory()) {
      throw new GavetaError('E_SKILL_PATH');
    }
  }
  return { current: resolved, entered: isInsideVault(root, resolved) };
}
