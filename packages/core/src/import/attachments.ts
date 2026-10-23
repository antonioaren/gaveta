import { createHash } from 'node:crypto';
import { lstat, mkdir, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { posix } from 'node:path';
import { parse } from 'parse5';
import type { DefaultTreeAdapterMap } from 'parse5';
import { GavetaError } from '../errors.ts';
import { isJavascriptUrl } from '../contract.ts';
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
  readonly noteVaultPath: string;
  readonly noteSourceMd: string;
  readonly html: string;
  readonly existingByHash: ReadonlyMap<string, string>;
}

export interface CollectAttachmentsResult {
  readonly html: string;
  readonly plans: readonly AttachmentPlan[];
}

export async function collectNoteAttachments(
  options: CollectAttachmentsOptions,
): Promise<CollectAttachmentsResult> {
  const refs = extractLocalRefs(options.html);
  const plans: AttachmentPlan[] = [];
  const hashToVault = new Map(options.existingByHash);
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
    let vaultPath = hashToVault.get(hash);
    if (vaultPath === undefined) {
      const baseName = posix.basename(sourceAbsolute);
      vaultPath = `attachments/${baseName}`;
      hashToVault.set(hash, vaultPath);
      plans.push({ vaultPath, bytes, hash });
    }
    const relative = relativeAttachmentHref(options.noteVaultPath, vaultPath);
    if (relative !== null && relative !== ref) {
      html = replaceSrc(html, ref, relative);
    }
  }
  return { html, plans };
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
