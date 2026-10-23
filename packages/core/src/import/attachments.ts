import { createHash } from 'node:crypto';
import { lstat, mkdir, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { posix } from 'node:path';
import { parse } from 'parse5';
import type { DefaultTreeAdapterMap } from 'parse5';
import { allocateSlug, isJavascriptUrl, slugify } from '../contract.ts';
import { GavetaError } from '../errors.ts';
import { isDataUrl } from '../links/path.ts';
import { writeAtomicBuffer } from '../vault/atomic.ts';
import { hasNodeErrorCode } from '../vault/node-error.ts';
import { isInsideVault, resolveInsideVault } from '../vault/paths.ts';

type ParseChild = DefaultTreeAdapterMap['childNode'];
type ParseElement = DefaultTreeAdapterMap['element'];

export interface AttachmentPlan {
  readonly vaultPath: string;
  readonly bytes: Buffer;
  readonly hash: string;
}

export interface CollectAttachmentsOptions {
  readonly sourceRoot: string;
  readonly vaultRoot: string;
  readonly noteVaultPath: string;
  readonly noteSourceMd: string;
  readonly html: string;
  readonly hashToVault: Map<string, string>;
  readonly takenPaths: Map<string, string>;
}

export interface CollectedAttachmentReport {
  readonly vaultPath: string;
  readonly hash: string;
  readonly deduplicated: boolean;
}

export interface CollectAttachmentsResult {
  readonly html: string;
  readonly plans: readonly AttachmentPlan[];
  readonly reports: readonly CollectedAttachmentReport[];
}

export async function collectNoteAttachments(
  options: CollectAttachmentsOptions,
): Promise<CollectAttachmentsResult> {
  const refs = extractLocalRefs(options.html);
  const plans: AttachmentPlan[] = [];
  const reports: CollectedAttachmentReport[] = [];
  let html = options.html;
  for (const ref of refs) {
    const sourceAbsolute = await resolveAttachmentSource(
      options.sourceRoot,
      options.noteSourceMd,
      ref,
    );
    if (sourceAbsolute === null) {
      continue;
    }
    const bytes = await readFile(sourceAbsolute);
    const hash = hashBytes(bytes);
    const existingPath = options.hashToVault.get(hash);
    let vaultPath = existingPath;
    let deduplicated = existingPath !== undefined;
    if (vaultPath === undefined) {
      const allocated = await allocateAttachmentVaultPath({
        vaultRoot: options.vaultRoot,
        sourceAbsolute,
        hash,
        bytes,
        hashToVault: options.hashToVault,
        takenPaths: options.takenPaths,
      });
      vaultPath = allocated.vaultPath;
      deduplicated = allocated.reusedExisting;
      if (!deduplicated) {
        plans.push({ vaultPath, bytes, hash });
      }
      options.hashToVault.set(hash, vaultPath);
      options.takenPaths.set(vaultPath, hash);
    }
    reports.push({ vaultPath, hash, deduplicated });
    const relative = relativeAttachmentHref(options.noteVaultPath, vaultPath);
    if (relative !== null && relative !== ref) {
      html = replaceSrc(html, ref, relative);
    }
  }
  return { html, plans, reports };
}

async function allocateAttachmentVaultPath(options: {
  readonly vaultRoot: string;
  readonly sourceAbsolute: string;
  readonly hash: string;
  readonly bytes: Buffer;
  readonly hashToVault: ReadonlyMap<string, string>;
  readonly takenPaths: ReadonlyMap<string, string>;
}): Promise<{ readonly vaultPath: string; readonly reusedExisting: boolean }> {
  const baseName = posix.basename(options.sourceAbsolute);
  const extensionIndex = baseName.lastIndexOf('.');
  const extension = extensionIndex >= 0 ? baseName.slice(extensionIndex) : '';
  const rawStem = extensionIndex >= 0 ? baseName.slice(0, extensionIndex) : baseName;
  const baseStem = slugify(rawStem) || 'adjunto';
  const takenStems = attachmentStemsInUse(options.hashToVault, options.takenPaths);
  await addVaultAttachmentStems(options.vaultRoot, takenStems);

  const exact = `attachments/${baseName}`;
  const exactReuse = await reusePathIfMatchingHash(options, exact);
  if (exactReuse !== null) {
    return exactReuse;
  }

  let allocatedStem = allocateSlug(baseStem, takenStems);
  for (;;) {
    const candidate =
      allocatedStem === baseStem && baseName === `${rawStem}${extension}`
        ? exact
        : `attachments/${allocatedStem}${extension}`;
    const reuse = await reusePathIfMatchingHash(options, candidate);
    if (reuse !== null) {
      return reuse;
    }
    const mappedHash = options.takenPaths.get(candidate);
    const onDisk = await readVaultBytesOrNull(options.vaultRoot, candidate);
    if (mappedHash === undefined && onDisk === null) {
      return { vaultPath: candidate, reusedExisting: false };
    }
    takenStems.add(allocatedStem);
    allocatedStem = allocateSlug(baseStem, takenStems);
  }
}

async function reusePathIfMatchingHash(
  options: {
    readonly vaultRoot: string;
    readonly hash: string;
    readonly takenPaths: ReadonlyMap<string, string>;
  },
  candidate: string,
): Promise<{ readonly vaultPath: string; readonly reusedExisting: boolean } | null> {
  const mappedHash = options.takenPaths.get(candidate);
  if (mappedHash !== undefined) {
    if (mappedHash === options.hash) {
      return { vaultPath: candidate, reusedExisting: true };
    }
    return null;
  }
  const onDisk = await readVaultBytesOrNull(options.vaultRoot, candidate);
  if (onDisk === null) {
    return null;
  }
  if (hashBytes(onDisk) === options.hash) {
    return { vaultPath: candidate, reusedExisting: true };
  }
  return null;
}

function attachmentStemsInUse(
  hashToVault: ReadonlyMap<string, string>,
  takenPaths: ReadonlyMap<string, string>,
): Set<string> {
  const stems = new Set<string>();
  for (const vaultPath of hashToVault.values()) {
    stems.add(attachmentStem(vaultPath));
  }
  for (const vaultPath of takenPaths.keys()) {
    stems.add(attachmentStem(vaultPath));
  }
  return stems;
}

async function addVaultAttachmentStems(vaultRoot: string, stems: Set<string>): Promise<void> {
  try {
    const attachmentsDir = await resolveInsideVault(vaultRoot, 'attachments');
    const listed = await lstat(attachmentsDir);
    if (!listed.isDirectory()) {
      return;
    }
    const { readdir } = await import('node:fs/promises');
    const entries = await readdir(attachmentsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile()) {
        continue;
      }
      stems.add(attachmentStem(`attachments/${entry.name}`));
    }
  } catch (error) {
    if (hasNodeErrorCode(error, 'ENOENT')) {
      return;
    }
    throw error;
  }
}

function attachmentStem(vaultPath: string): string {
  const base = posix.basename(vaultPath);
  const extensionIndex = base.lastIndexOf('.');
  const stem = extensionIndex >= 0 ? base.slice(0, extensionIndex) : base;
  return stem.length > 0 ? stem : 'adjunto';
}

async function readVaultBytesOrNull(vaultRoot: string, userPath: string): Promise<Buffer | null> {
  try {
    const absolute = await resolveInsideVault(vaultRoot, userPath);
    return await readFile(absolute);
  } catch (error) {
    if (hasNodeErrorCode(error, 'ENOENT')) {
      return null;
    }
    throw error;
  }
}

export async function writeVaultBytes(
  vaultRoot: string,
  userPath: string,
  contents: Buffer,
): Promise<void> {
  const root = await realpath(vaultRoot);
  const entry = await resolveInsideVault(root, userPath);
  if (!isInsideVault(root, entry) || entry === root) {
    throw new GavetaError('E_PATH_OUTSIDE_VAULT');
  }
  const existing = await readVaultBytesOrNull(root, userPath);
  if (existing !== null && !existing.equals(contents)) {
    throw new GavetaError('E_IMPORT_ABORTED');
  }
  if (existing !== null) {
    return;
  }
  const parent = path.dirname(entry);
  const parentRelative = path.relative(root, parent).split(path.sep).join('/');
  if (parentRelative.length > 0 && parentRelative !== '.') {
    const parentAbsolute = await resolveInsideVault(root, parentRelative);
    if (!isInsideVault(root, parentAbsolute)) {
      throw new GavetaError('E_PATH_OUTSIDE_VAULT');
    }
    await mkdir(parentAbsolute, { recursive: true });
  }
  await writeAtomicBuffer(entry, contents);
}

export function hashBytes(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function extractLocalRefs(html: string): string[] {
  const refs = new Set<string>();
  let document;
  try {
    document = parse(html, { scriptingEnabled: false });
  } catch {
    return [];
  }
  const stack: ParseChild[] = [...document.childNodes];
  while (stack.length > 0) {
    const node = stack.pop();
    if (node === undefined) {
      continue;
    }
    if (
      node.nodeName === '#text' ||
      node.nodeName === '#comment' ||
      node.nodeName === '#documentType'
    ) {
      continue;
    }
    const element = node as ParseElement;
    if (element.tagName.toLowerCase() === 'img') {
      const src = attr(element, 'src');
      if (src !== null && isLocalRef(src)) {
        refs.add(src);
      }
    }
    for (const child of element.childNodes) {
      stack.push(child);
    }
  }
  return [...refs];
}

function isLocalRef(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return false;
  }
  if (isJavascriptUrl(trimmed) || isDataUrl(trimmed)) {
    return false;
  }
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed) || trimmed.startsWith('//')) {
    return false;
  }
  return true;
}

async function resolveAttachmentSource(
  sourceRoot: string,
  noteSourceMd: string,
  href: string,
): Promise<string | null> {
  const noteDir = posix.dirname(noteSourceMd);
  const joined = posix.normalize(posix.join(noteDir, href.split('#')[0] ?? href));
  if (joined.startsWith('..')) {
    return null;
  }
  const absolute = path.join(sourceRoot, ...joined.split('/'));
  try {
    const listed = await lstat(absolute);
    if (!listed.isFile()) {
      return null;
    }
    return absolute;
  } catch (error) {
    if (hasNodeErrorCode(error, 'ENOENT')) {
      return null;
    }
    throw error;
  }
}

function relativeAttachmentHref(fromNotePath: string, attachmentVaultPath: string): string | null {
  const noteDir = posix.dirname(fromNotePath);
  const relative = posix.relative(noteDir, attachmentVaultPath);
  return relative.length === 0 ? posix.basename(attachmentVaultPath) : relative;
}

function replaceSrc(html: string, from: string, to: string): string {
  return html.split(`src="${from}"`).join(`src="${to}"`).split(`src='${from}'`).join(`src='${to}'`);
}

function attr(element: ParseElement, name: string): string | null {
  for (const attribute of element.attrs) {
    if (attribute.name.toLowerCase() === name) {
      return attribute.value;
    }
  }
  return null;
}
