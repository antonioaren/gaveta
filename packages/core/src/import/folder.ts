/**
 * Markdown folder import (REQ-MIG-02–07): walk, convert, two-pass link resolution,
 * attachment copy with deduplication, dry-run planning, and atomic batch writes.
 */
import { lstat, readFile, realpath, readdir } from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import path from 'node:path';
import { allocateSlug, slugify } from '../contract.ts';
import {
  convertMarkdownToHtml,
  finalizeMarkdownHtml,
  type MarkdownConvertResult,
  type MarkdownConvertWarning,
} from '../convert/md-to-html.ts';
import {
  GavetaError,
  isErrorCode,
  isWarningCode,
  type ErrorCode,
  type WarningCode,
} from '../errors.ts';
import { resolveNoteLinks } from '../links/rewrite.ts';
import type { LinkDiagnostic, ResolvedLink } from '../links/types.ts';
import { parseNote } from '../parser.ts';
import { commitNoteChanges, type Change } from '../ops/commit.ts';
import { rootOf } from '../ops/move.ts';
import { openVaultIndex, type VaultIndex } from '../sqlite/store.ts';
import { createUlid } from '../ulid.ts';
import { readVaultConfig, type VaultConfig } from '../vault/config.ts';
import { hasNodeErrorCode } from '../vault/node-error.ts';
import { readVaultText, resolveInsideVault } from '../vault/paths.ts';
import { validateNote } from '../validate.ts';
import { collectNoteAttachments, writeVaultBytes, type AttachmentPlan } from './attachments.ts';
import { mergeExcludePatterns, shouldExcludeImportPath, vaultPathFromMarkdown } from './exclude.ts';
import { withImportOverlay } from './overlay.ts';
import { rewriteImportedMarkdownLinks } from './relative.ts';
import { walkMarkdownFolder, type WalkedMarkdownFile } from './walk.ts';

export type ImportOnConflict = 'skip' | 'rename' | 'overwrite';

export interface ImportMarkdownFolderOptions {
  readonly vaultRoot: string;
  readonly sourcePath: string;
  readonly in?: string;
  readonly exclude?: readonly string[];
  readonly dryRun?: boolean;
  readonly onConflict?: ImportOnConflict;
  readonly continueOnError?: boolean;
  readonly now?: () => string;
  readonly createId?: () => string;
}

export interface ImportWarning {
  readonly code: WarningCode;
  readonly params?: Readonly<Record<string, string | number>>;
}

export interface ImportNoteLink {
  readonly kind: ResolvedLink['kind'];
  readonly text: string;
  readonly targetId: string | null;
  readonly pendingTitle: string | null;
  readonly href: string | null;
}

export interface ImportNoteReport {
  readonly sourceMd: string;
  readonly path: string;
  readonly id: string;
  readonly title: string;
  readonly warnings: readonly ImportWarning[];
  readonly links: readonly ImportNoteLink[];
  readonly action: 'create' | 'overwrite' | 'skip' | 'rename';
}

export interface ImportFailureReport {
  readonly sourceMd: string;
  readonly path: string | null;
  readonly code: ErrorCode;
}

export interface ImportAttachmentReport {
  readonly vaultPath: string;
  readonly hash: string;
  readonly deduplicated: boolean;
}

export interface ImportMarkdownFolderResult {
  readonly ok: boolean;
  readonly dryRun: boolean;
  readonly notes: readonly ImportNoteReport[];
  readonly failures: readonly ImportFailureReport[];
  readonly attachments: readonly ImportAttachmentReport[];
}

interface PlannedNote {
  readonly sourceMd: string;
  readonly path: string;
  readonly id: string;
  readonly title: string;
  readonly html: string;
  readonly warnings: readonly ImportWarning[];
  readonly links: readonly ImportNoteLink[];
  readonly action: ImportNoteReport['action'];
}

const IMPORT_KEYS = [
  'vaultRoot',
  'sourcePath',
  'in',
  'exclude',
  'dryRun',
  'onConflict',
  'continueOnError',
] as const;

export async function importMarkdownFolder(
  options: ImportMarkdownFolderOptions,
): Promise<ImportMarkdownFolderResult> {
  const input = readOptions(options);
  const createId = options.createId ?? (() => createUlid());
  const now = options.now?.() ?? new Date().toISOString();
  const config = await readVaultConfig(input.vaultRoot);
  const { root: sourceReal, walked } = await resolveImportSource(input.sourcePath, input.exclude);
  const index = await openVaultIndex(input.vaultRoot);
  try {
    const planned = await planImport({
      walked: [...walked],
      vaultRoot: input.vaultRoot,
      inFolder: input.inFolder,
      config,
      index,
      onConflict: input.onConflict,
      now,
      createId,
      sourceRoot: sourceReal,
    });
    const failures = planned.failures;
    const ready = planned.notes.filter((note) => note.action !== 'skip' && note.html.length > 0);
    const skipped = planned.notes.filter((note) => note.action === 'skip');
    if (!input.continueOnError && failures.length > 0) {
      return {
        ok: false,
        dryRun: input.dryRun,
        notes: [...skipped, ...ready].map(toReport),
        failures,
        attachments: [],
      };
    }
    if (input.dryRun) {
      return {
        ok: failures.length === 0,
        dryRun: true,
        notes: [...skipped, ...ready].map(toReport),
        failures,
        attachments: planned.attachmentReports,
      };
    }
    if (ready.length === 0) {
      return {
        ok: failures.length === 0,
        dryRun: false,
        notes: skipped.map(toReport),
        failures,
        attachments: [],
      };
    }
    try {
      await commitImport(index, ready, planned.attachmentPlans);
    } catch (error) {
      if (!input.continueOnError) {
        throw new GavetaError('E_IMPORT_ABORTED');
      }
      const code = error instanceof GavetaError ? error.code : 'E_IMPORT_ABORTED';
      const commitCode = isErrorCode(code) ? code : 'E_IMPORT_ABORTED';
      const failed: ImportFailureReport[] = [
        ...failures,
        ...ready.map((note) => ({
          sourceMd: note.sourceMd,
          path: note.path,
          code: commitCode,
        })),
      ];
      return {
        ok: false,
        dryRun: false,
        notes: skipped.map(toReport),
        failures: failed,
        attachments: [],
      };
    }
    return {
      ok: failures.length === 0,
      dryRun: false,
      notes: [...skipped, ...ready].map(toReport),
      failures,
      attachments: planned.attachmentReports,
    };
  } finally {
    index.close();
  }
}

async function planImport(options: {
  readonly walked: Awaited<ReturnType<typeof walkMarkdownFolder>>;
  readonly vaultRoot: string;
  readonly inFolder: string;
  readonly config: VaultConfig;
  readonly index: VaultIndex;
  readonly onConflict: ImportOnConflict;
  readonly now: string;
  readonly createId: () => string;
  readonly sourceRoot: string;
}): Promise<{
  readonly notes: PlannedNote[];
  readonly failures: ImportFailureReport[];
  readonly attachmentPlans: AttachmentPlan[];
  readonly attachmentReports: ImportAttachmentReport[];
}> {
  const failures: ImportFailureReport[] = [];
  const passOne: {
    sourceMd: string;
    path: string;
    id: string;
    title: string;
    html: string;
    warnings: ImportWarning[];
    action: ImportNoteReport['action'];
  }[] = [];
  const takenPaths = new Set<string>();
  for (const file of options.walked) {
    const vaultPath = vaultPathFromMarkdown(file.relativePath, options.inFolder);
    const conflict = await readConflict(options.vaultRoot, vaultPath, options.onConflict);
    if (conflict.kind === 'skip') {
      passOne.push({
        sourceMd: file.relativePath,
        path: vaultPath,
        id: options.createId(),
        title: '',
        html: '',
        warnings: [{ code: 'W_IMPORT_SKIPPED' }],
        action: 'skip',
      });
      continue;
    }
    let targetPath = vaultPath;
    let action: ImportNoteReport['action'] = conflict.kind === 'overwrite' ? 'overwrite' : 'create';
    if (conflict.kind === 'rename') {
      targetPath = await allocateImportPath(options.vaultRoot, vaultPath, takenPaths);
      action = 'rename';
    } else if (takenPaths.has(targetPath)) {
      targetPath = await allocateImportPath(options.vaultRoot, targetPath, takenPaths);
      action = 'rename';
    }
    takenPaths.add(targetPath);
    let converted: MarkdownConvertResult;
    try {
      converted = convertMarkdownToHtml(file.markdown, { sourcePath: file.relativePath });
    } catch (caught) {
      if (caught instanceof GavetaError && caught.code === 'E_IMPORT_PARSE') {
        failures.push({ sourceMd: file.relativePath, path: targetPath, code: 'E_IMPORT_PARSE' });
        continue;
      }
      throw caught;
    }
    const id =
      conflict.kind === 'overwrite' && conflict.preserveId !== undefined
        ? conflict.preserveId
        : options.createId();
    const finalized = finalizeMarkdownHtml(converted, {
      id,
      now: options.now,
      notePath: targetPath,
      remoteAllowlist: options.config.remoteAllowlist,
    });
    if (!finalized.ok || finalized.html === null) {
      const blocking = finalized.diagnostics.find(
        (item) => item.severity === 'error' && isErrorCode(item.code),
      );
      failures.push({
        sourceMd: file.relativePath,
        path: targetPath,
        code:
          blocking !== undefined && isErrorCode(blocking.code) ? blocking.code : 'E_HTML_INVALID',
      });
      continue;
    }
    const warnings = mergeWarnings(converted.warnings, finalized.warnings);
    passOne.push({
      sourceMd: file.relativePath,
      path: targetPath,
      id,
      title: converted.title,
      html: finalized.html,
      warnings,
      action,
    });
  }

  const knownSourceMds = new Set(options.walked.map((file) => file.relativePath));
  const failedSources = new Set<string>();
  const passTwoFailures = new Map<string, ImportFailureReport>();
  const resolvedBySource = new Map<string, PlannedNote>();
  const attachmentHashToVault = new Map<string, string>();
  const attachmentTakenPaths = new Map<string, string>();
  const attachmentPlans: AttachmentPlan[] = [];
  const attachmentReports: ImportAttachmentReport[] = [];

  let passTwoStable = false;
  while (!passTwoStable) {
    passTwoStable = true;
    const active = passOne.filter(
      (note) => note.action !== 'skip' && note.html.length > 0 && !failedSources.has(note.sourceMd),
    );
    const overlay = withImportOverlay(
      options.index,
      active.map((note) => ({ path: note.path, html: note.html })),
    );
    const sourceMdIndex = await buildSourceMdIndex(options.vaultRoot, passOne, failedSources);
    const roundFailures: string[] = [];
    const roundResolved = new Map<string, PlannedNote>();

    for (const note of passOne) {
      if (note.action === 'skip') {
        continue;
      }
      if (note.html.length === 0 || failedSources.has(note.sourceMd)) {
        continue;
      }
      const withMdLinks = rewriteImportedMarkdownLinks({
        html: note.html,
        fromVaultPath: note.path,
        fromSourceMd: note.sourceMd,
        knownSourceMds,
        lookupSourceMd: (sourceMd) => sourceMdIndex.get(sourceMd) ?? null,
        sectionFor: (targetPath, rawSection) => sectionFragment(overlay, targetPath, rawSection),
      });
      const resolved = resolveNoteLinks({
        html: withMdLinks,
        fromPath: note.path,
        index: overlay,
        rel: options.config.rel,
      });
      if (!resolved.ok) {
        const resolveError = resolved.errors.find((item) => isErrorCode(item.code));
        passTwoFailures.set(note.sourceMd, {
          sourceMd: note.sourceMd,
          path: note.path,
          code:
            resolveError !== undefined && isErrorCode(resolveError.code)
              ? resolveError.code
              : 'E_HTML_INVALID',
        });
        roundFailures.push(note.sourceMd);
        continue;
      }
      const validated = validateNote(resolved.html, {
        notePath: note.path,
        remoteAllowlist: options.config.remoteAllowlist,
        relVocabulary: options.config.rel.vocabulary,
      });
      if (!validated.ok) {
        const validateError = validated.diagnostics.find(
          (item) => item.severity === 'error' && isErrorCode(item.code),
        );
        passTwoFailures.set(note.sourceMd, {
          sourceMd: note.sourceMd,
          path: note.path,
          code:
            validateError !== undefined && isErrorCode(validateError.code)
              ? validateError.code
              : 'E_HTML_INVALID',
        });
        roundFailures.push(note.sourceMd);
        continue;
      }
      const linkWarnings = warningsFromLinks(resolved.warnings);
      roundResolved.set(note.sourceMd, {
        sourceMd: note.sourceMd,
        path: note.path,
        id: note.id,
        title: note.title,
        html: resolved.html,
        warnings: mergeWarnings(note.warnings, linkWarnings),
        links: mapLinks(resolved.links),
        action: note.action,
      });
    }

    if (roundFailures.length === 0) {
      for (const [sourceMd, planned] of roundResolved) {
        passTwoFailures.delete(sourceMd);
        resolvedBySource.set(sourceMd, planned);
      }
      continue;
    }
    passTwoStable = false;
    for (const sourceMd of roundFailures) {
      failedSources.add(sourceMd);
    }
  }

  failures.push(...passTwoFailures.values());

  const resolvedNotes: PlannedNote[] = [];
  for (const note of passOne) {
    if (note.action === 'skip') {
      resolvedNotes.push({
        ...note,
        links: [],
      });
      continue;
    }
    const planned = resolvedBySource.get(note.sourceMd);
    if (planned === undefined) {
      continue;
    }
    const collected = await collectNoteAttachments({
      sourceRoot: options.sourceRoot,
      vaultRoot: options.vaultRoot,
      noteVaultPath: planned.path,
      noteSourceMd: planned.sourceMd,
      html: planned.html,
      hashToVault: attachmentHashToVault,
      takenPaths: attachmentTakenPaths,
    });
    for (const plan of collected.plans) {
      attachmentPlans.push(plan);
    }
    for (const report of collected.reports) {
      attachmentReports.push({
        vaultPath: report.vaultPath,
        hash: report.hash,
        deduplicated: report.deduplicated,
      });
    }
    resolvedNotes.push({
      ...planned,
      html: collected.html,
    });
  }

  return { notes: resolvedNotes, failures, attachmentPlans, attachmentReports };
}

async function buildSourceMdIndex(
  vaultRoot: string,
  passOne: readonly {
    sourceMd: string;
    path: string;
    id: string;
    title: string;
    html: string;
    action: ImportNoteReport['action'];
  }[],
  failedSources: ReadonlySet<string>,
): Promise<Map<string, { id: string; path: string; title: string }>> {
  const index = new Map<string, { id: string; path: string; title: string }>();
  for (const note of passOne) {
    if (note.action === 'skip') {
      const existing = await readTextOrNull(vaultRoot, note.path);
      if (existing === null) {
        continue;
      }
      const parsed = parseNote(existing);
      const id = parsed.ok ? (parsed.note?.id ?? null) : null;
      if (id === null) {
        continue;
      }
      index.set(note.sourceMd, {
        id,
        path: note.path,
        title: parsed.ok && parsed.note !== null ? (parsed.note.title ?? '') : '',
      });
      continue;
    }
    if (note.html.length === 0 || failedSources.has(note.sourceMd)) {
      continue;
    }
    index.set(note.sourceMd, { id: note.id, path: note.path, title: note.title });
  }
  return index;
}

async function commitImport(
  index: VaultIndex,
  notes: readonly PlannedNote[],
  attachments: readonly AttachmentPlan[],
): Promise<void> {
  const root = rootOf(index);
  const writtenAttachments: { path: string; before: Buffer | null }[] = [];
  const changes: Change[] = [];
  try {
    for (const attachment of attachments) {
      const before = await readBytesOrNull(root, attachment.vaultPath);
      await writeVaultBytes(root, attachment.vaultPath, attachment.bytes);
      writtenAttachments.push({ path: attachment.vaultPath, before });
    }
    for (const note of notes) {
      if (note.action === 'skip' || note.html.length === 0) {
        continue;
      }
      const before = await readTextOrNull(root, note.path);
      changes.push({ path: note.path, before, after: note.html });
    }
    await commitNoteChanges(index, root, changes, async () => {
      for (const note of notes) {
        if (note.action === 'skip' || note.html.length === 0) {
          continue;
        }
        await index.upsert(note.path);
      }
    });
  } catch (error) {
    for (let index = writtenAttachments.length - 1; index >= 0; index -= 1) {
      const entry = writtenAttachments[index];
      if (entry === undefined) {
        continue;
      }
      if (entry.before === null) {
        await deleteIfExists(root, entry.path);
        continue;
      }
      await writeVaultBytes(root, entry.path, entry.before);
    }
    throw error;
  }
}

function sectionFragment(index: VaultIndex, notePath: string, raw: string | null): string | null {
  if (raw === null) {
    return null;
  }
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return null;
  }
  for (const section of index.sections(notePath)) {
    const id = section.sectionId;
    if (id !== null && (id === trimmed || slugify(trimmed) === id)) {
      return id;
    }
    if (section.heading !== null && slugify(section.heading) === slugify(trimmed) && id !== null) {
      return id;
    }
  }
  return slugify(trimmed);
}

type ConflictPlan =
  | { readonly kind: 'create' }
  | { readonly kind: 'skip' }
  | { readonly kind: 'rename' }
  | { readonly kind: 'overwrite'; readonly preserveId?: string };

async function readConflict(
  vaultRoot: string,
  vaultPath: string,
  onConflict: ImportOnConflict,
): Promise<ConflictPlan> {
  try {
    const existing = await readVaultText(vaultRoot, vaultPath);
    if (onConflict === 'overwrite') {
      const id = parseNote(existing).note?.id;
      return id === null || id === undefined
        ? { kind: 'overwrite' }
        : { kind: 'overwrite', preserveId: id };
    }
    if (onConflict === 'rename') {
      return { kind: 'rename' };
    }
    return { kind: 'skip' };
  } catch (error) {
    if (hasNodeErrorCode(error, 'ENOENT')) {
      return { kind: 'create' };
    }
    throw error;
  }
}

async function resolveImportSource(
  sourcePath: string,
  exclude: readonly string[] | undefined,
): Promise<{ readonly root: string; readonly walked: readonly WalkedMarkdownFile[] }> {
  const absolute = path.resolve(sourcePath);
  let real: string;
  try {
    real = await realpath(absolute);
  } catch {
    throw new GavetaError('E_ARG_INVALID');
  }
  let listed;
  try {
    listed = await lstat(real);
  } catch {
    throw new GavetaError('E_ARG_INVALID');
  }
  if (listed.isDirectory()) {
    const walked = await walkMarkdownFolder(real, exclude);
    return { root: real, walked };
  }
  if (!listed.isFile()) {
    throw new GavetaError('E_ARG_INVALID');
  }
  if (!real.toLowerCase().endsWith('.md')) {
    throw new GavetaError('E_ARG_INVALID');
  }
  const relativePath = path.basename(real);
  const patterns = mergeExcludePatterns(exclude);
  if (shouldExcludeImportPath(relativePath, patterns)) {
    return { root: path.dirname(real), walked: [] };
  }
  const markdown = await readFile(real, 'utf8');
  return {
    root: path.dirname(real),
    walked: [{ relativePath, absolutePath: real, markdown }],
  };
}

async function allocateImportPath(
  vaultRoot: string,
  desired: string,
  taken: ReadonlySet<string>,
): Promise<string> {
  const segments = desired.split('/');
  const file = segments.pop() ?? 'nota.html';
  const folder = segments.join('/');
  const stem = file.replace(/\.html$/i, '');
  const base = slugify(stem);
  const stems = await takenStems(vaultRoot, folder, taken);
  const nextStem = allocateSlug(base.length === 0 ? 'nota' : base, stems);
  const nextFile = `${nextStem}.html`;
  return folder.length === 0 ? nextFile : `${folder}/${nextFile}`;
}

async function takenStems(
  vaultRoot: string,
  folder: string,
  taken: ReadonlySet<string>,
): Promise<Set<string>> {
  const stems = new Set<string>();
  for (const notePath of taken) {
    if (folder.length === 0) {
      if (!notePath.includes('/')) {
        stems.add(notePath.replace(/\.html$/i, ''));
      }
      continue;
    }
    if (notePath.startsWith(`${folder}/`)) {
      const rest = notePath.slice(folder.length + 1);
      if (!rest.includes('/')) {
        stems.add(rest.replace(/\.html$/i, ''));
      }
    }
  }
  try {
    const absolute = await resolveInsideVault(vaultRoot, folder.length === 0 ? '.' : folder);
    const listed = await lstat(absolute);
    if (!listed.isDirectory()) {
      return stems;
    }
    const entries: Dirent[] = await readdir(absolute, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.name.endsWith('.html')) {
        continue;
      }
      const stem = entry.name.slice(0, -'.html'.length);
      if (stem.length > 0) {
        stems.add(stem);
      }
    }
  } catch {
    return stems;
  }
  return stems;
}

function readOptions(options: ImportMarkdownFolderOptions): {
  vaultRoot: string;
  sourcePath: string;
  inFolder: string;
  exclude?: readonly string[];
  dryRun: boolean;
  onConflict: ImportOnConflict;
  continueOnError: boolean;
} {
  const record = readRecord(stripImportHooks(options), IMPORT_KEYS);
  const vaultRoot = requiredString(record.vaultRoot);
  const sourcePath = requiredString(record.sourcePath);
  const inFolder = optionalString(record.in)?.trim() ?? '';
  if (inFolder.includes('\0') || inFolder.includes('..')) {
    throw new GavetaError('E_ARG_INVALID');
  }
  const onConflict = optionalString(record.onConflict) ?? 'skip';
  if (onConflict !== 'skip' && onConflict !== 'rename' && onConflict !== 'overwrite') {
    throw new GavetaError('E_ARG_INVALID');
  }
  const exclude = readStringArray(record.exclude);
  return {
    vaultRoot,
    sourcePath,
    inFolder,
    ...(exclude !== undefined ? { exclude } : {}),
    dryRun: record.dryRun === true,
    onConflict,
    continueOnError: record.continueOnError === true,
  };
}

function stripImportHooks(options: ImportMarkdownFolderOptions): Record<string, unknown> {
  const record: Record<string, unknown> = {};
  for (const key of IMPORT_KEYS) {
    if (key in options) {
      record[key] = options[key as keyof ImportMarkdownFolderOptions];
    }
  }
  return record;
}

function readRecord(value: unknown, allowed: readonly string[]): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new GavetaError('E_ARG_INVALID');
  }
  const record: Record<string, unknown> = {};
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) {
      throw new GavetaError('E_ARG_INVALID');
    }
    record[key] = value[key as keyof typeof value];
  }
  return record;
}

function requiredString(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new GavetaError('E_ARG_INVALID');
  }
  return value;
}

function optionalString(value: unknown): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== 'string') {
    throw new GavetaError('E_ARG_INVALID');
  }
  return value;
}

function readStringArray(value: unknown): readonly string[] | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) {
    throw new GavetaError('E_ARG_INVALID');
  }
  return value;
}

function mergeWarnings(
  ...groups: readonly (readonly ImportWarning[] | readonly MarkdownConvertWarning[])[]
): ImportWarning[] {
  const out: ImportWarning[] = [];
  for (const group of groups) {
    for (const warning of group) {
      if (!isWarningCode(warning.code)) {
        continue;
      }
      out.push({
        code: warning.code,
        ...(warning.params !== undefined ? { params: warning.params } : {}),
      });
    }
  }
  return out;
}

function warningsFromLinks(diagnostics: readonly LinkDiagnostic[]): ImportWarning[] {
  const out: ImportWarning[] = [];
  for (const diagnostic of diagnostics) {
    if (diagnostic.severity !== 'warning' || !isWarningCode(diagnostic.code)) {
      continue;
    }
    const params: Record<string, string | number> = {};
    if (diagnostic.details !== null) {
      for (const [key, value] of Object.entries(diagnostic.details)) {
        if (typeof value === 'string' || typeof value === 'number') {
          params[key] = value;
        }
      }
    }
    out.push({ code: diagnostic.code, params });
  }
  return out;
}

function mapLinks(links: readonly ResolvedLink[]): ImportNoteLink[] {
  return links.map((link) => ({
    kind: link.kind,
    text: link.text,
    targetId: link.targetId,
    pendingTitle: link.pendingTitle,
    href: link.href,
  }));
}

function toReport(note: PlannedNote): ImportNoteReport {
  return {
    sourceMd: note.sourceMd,
    path: note.path,
    id: note.id,
    title: note.title,
    warnings: note.warnings,
    links: note.links,
    action: note.action,
  };
}

async function readTextOrNull(root: string, notePath: string): Promise<string | null> {
  try {
    return await readVaultText(root, notePath);
  } catch (error) {
    if (hasNodeErrorCode(error, 'ENOENT')) {
      return null;
    }
    throw error;
  }
}

async function readBytesOrNull(root: string, notePath: string): Promise<Buffer | null> {
  try {
    const absolute = await resolveInsideVault(root, notePath);
    return await readFile(absolute);
  } catch (error) {
    if (hasNodeErrorCode(error, 'ENOENT')) {
      return null;
    }
    throw error;
  }
}

async function deleteIfExists(root: string, notePath: string): Promise<void> {
  try {
    const absolute = await resolveInsideVault(root, notePath);
    const { unlink } = await import('node:fs/promises');
    await unlink(absolute);
  } catch (error) {
    if (hasNodeErrorCode(error, 'ENOENT')) {
      return;
    }
    throw error;
  }
}
