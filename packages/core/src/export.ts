import { copyFile, lstat, mkdir, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { parse } from 'parse5';
import type { DefaultTreeAdapterMap } from 'parse5';
import {
  convertHtmlToMarkdown,
  type HtmlExportLinksMode,
  type HtmlExportTarget,
  type HtmlToMarkdownWarning,
} from './convert/html-to-md.ts';
import { GavetaError } from './errors.ts';
import { inspectVaultPath, isProducedHref, resolveVaultHref } from './links/path.ts';
import { resolveRef } from './links/ref.ts';
import { scanNoteFiles } from './sqlite/scan.ts';
import { openVaultIndex, type VaultIndex } from './sqlite/store.ts';
import { pathOutsideVault } from './vault/errors.ts';
import { hasNodeErrorCode } from './vault/node-error.ts';
import { isInsideVault, readVaultText, resolveInsideVault } from './vault/paths.ts';
import { writeAtomic } from './vault/atomic.ts';

type ParseChild = DefaultTreeAdapterMap['childNode'];
type ParseElement = DefaultTreeAdapterMap['element'];

export type ExportFormat = 'md';

export interface ExportVaultOptions {
  readonly vaultRoot: string;
  readonly cwd: string;
  readonly outDir: string;
  readonly format: string;
  readonly ref?: string;
  readonly all?: boolean;
  readonly links?: HtmlExportLinksMode;
  readonly dryRun?: boolean;
  readonly force?: boolean;
}

export interface ExportedNoteReport {
  readonly path: string;
  readonly source: string;
  readonly warnings: readonly HtmlToMarkdownWarning[];
  readonly losses: readonly { readonly detail: string }[];
}

export interface ExportVaultReport {
  readonly dryRun: boolean;
  readonly outDir: string;
  readonly notes: readonly ExportedNoteReport[];
  readonly attachments: readonly string[];
}

export async function exportVaultToMarkdown(
  options: ExportVaultOptions,
): Promise<ExportVaultReport> {
  if (options.format !== 'md') {
    throw new GavetaError('E_ARG_INVALID');
  }
  const all = options.all === true;
  const ref = options.ref?.trim();
  if (all && ref !== undefined && ref.length > 0) {
    throw new GavetaError('E_ARG_INVALID');
  }
  if (!all && (ref === undefined || ref.length === 0)) {
    throw new GavetaError('E_ARG_INVALID');
  }

  const vaultRoot = await realVaultRoot(options.vaultRoot);
  const exportRoot = await resolveExportRoot(vaultRoot, options.cwd, options.outDir);
  const links = options.links ?? 'wiki';
  const dryRun = options.dryRun === true;
  const force = options.force === true;
  if (!dryRun) {
    await mkdir(exportRoot, { recursive: true });
    const exportReal = await realpath(exportRoot);
    if (isInsideVault(vaultRoot, exportReal) || exportReal === vaultRoot) {
      throw new GavetaError('E_ARG_INVALID');
    }
  }

  const index = await openVaultIndex(vaultRoot);
  try {
    const notePaths = await selectNotePaths(vaultRoot, index, ref, all);
    const targets = buildTargetMap(index);
    const attachments = new Set<string>();
    const notes: ExportedNoteReport[] = [];

    for (const notePath of notePaths) {
      const html = await readVaultText(vaultRoot, notePath);
      for (const attachment of collectAttachmentPaths(html, notePath)) {
        attachments.add(attachment);
      }
      const converted = convertHtmlToMarkdown(html, {
        links,
        notePath,
        resolveTarget: (id) => targets.get(id) ?? null,
      });
      const mdPath = htmlPathToMd(notePath);
      notes.push({
        path: mdPath,
        source: notePath,
        warnings: converted.warnings,
        losses: converted.losses,
      });
      if (!dryRun) {
        await writeExportFile(exportRoot, mdPath, converted.markdown, force);
      }
    }

    const attachmentList = [...attachments].sort();
    if (!dryRun) {
      for (const attachment of attachmentList) {
        await copyVaultAttachment(vaultRoot, exportRoot, attachment, force);
      }
    }

    return {
      dryRun,
      outDir: exportRoot,
      notes,
      attachments: attachmentList,
    };
  } finally {
    index.close();
  }
}

async function selectNotePaths(
  vaultRoot: string,
  index: VaultIndex,
  ref: string | undefined,
  all: boolean,
): Promise<string[]> {
  const scanned = await scanNoteFiles(vaultRoot);
  const scannedPaths = scanned.files.map((file) => file.relativePath);
  if (all) {
    return scannedPaths;
  }
  if (ref === undefined) {
    throw new GavetaError('E_ARG_INVALID');
  }
  const inspected = inspectVaultPath(ref);
  if (!inspected.ok) {
    throw new GavetaError('E_ARG_INVALID');
  }
  if (scannedPaths.includes(inspected.path)) {
    return [inspected.path];
  }
  if (inspected.path.endsWith('.html')) {
    throw new GavetaError('E_REF_NOT_FOUND');
  }
  const prefix = inspected.path;
  const folderMatches = scannedPaths.filter(
    (path) => path === prefix || path.startsWith(`${prefix}/`),
  );
  if (folderMatches.length > 0) {
    return folderMatches;
  }
  const resolved = resolveRef(index, ref);
  return [resolved.path];
}

function buildTargetMap(index: VaultIndex): Map<string, HtmlExportTarget> {
  const map = new Map<string, HtmlExportTarget>();
  for (const note of index.notes()) {
    if (note.id === null) {
      continue;
    }
    map.set(note.id, { id: note.id, title: note.title, path: note.path });
  }
  return map;
}

function htmlPathToMd(notePath: string): string {
  return notePath.replace(/\.html$/i, '.md');
}

function collectAttachmentPaths(html: string, notePath: string): string[] {
  const document = parse(html, { scriptingEnabled: false });
  const found = new Set<string>();
  for (const child of document.childNodes) {
    walkTree(child, (element) => {
      if (element.tagName !== 'img' && element.tagName !== 'source') {
        return;
      }
      const src = readAttr(element, 'src');
      if (src === null || src.length === 0) {
        return;
      }
      if (!isProducedHref(src)) {
        return;
      }
      const resolved = resolveVaultHref(notePath, src);
      if (resolved === null) {
        throw pathOutsideVault();
      }
      if (!resolved.endsWith('.html')) {
        found.add(resolved);
      }
    });
  }
  return [...found].sort();
}

function walkTree(node: ParseChild, visit: (element: ParseElement) => void): void {
  if (isElement(node)) {
    visit(node);
  }
  const children = childNodesOf(node);
  for (const child of children) {
    walkTree(child, visit);
  }
}

function childNodesOf(node: ParseChild): readonly ParseChild[] {
  if ('childNodes' in node && Array.isArray(node.childNodes)) {
    return node.childNodes;
  }
  return [];
}

function isElement(node: ParseChild): node is ParseElement {
  return (
    node.nodeName !== '#text' &&
    node.nodeName !== '#comment' &&
    node.nodeName !== '#document' &&
    'tagName' in node
  );
}

function readAttr(element: ParseElement, name: string): string | null {
  for (const attr of element.attrs) {
    if (attr.name.toLowerCase() === name) {
      return attr.value;
    }
  }
  return null;
}

async function copyVaultAttachment(
  vaultRoot: string,
  exportRoot: string,
  vaultRelative: string,
  force: boolean,
): Promise<void> {
  const source = await resolveInsideVault(vaultRoot, vaultRelative);
  const destination = await resolveInsideExport(exportRoot, vaultRelative);
  await assertReadableVaultFile(vaultRoot, source);
  await writeExportBinary(exportRoot, source, destination, force);
}

async function writeExportFile(
  exportRoot: string,
  relativePath: string,
  contents: string,
  force: boolean,
): Promise<void> {
  const destination = await resolveInsideExport(exportRoot, relativePath);
  await assertWritableExport(exportRoot, destination, force);
  await mkdir(path.dirname(destination), { recursive: true });
  await writeAtomic(destination, contents);
}

async function writeExportBinary(
  exportRoot: string,
  source: string,
  destination: string,
  force: boolean,
): Promise<void> {
  await assertWritableExport(exportRoot, destination, force);
  await mkdir(path.dirname(destination), { recursive: true });
  await copyFile(source, destination);
}

async function assertWritableExport(
  exportRoot: string,
  destination: string,
  force: boolean,
): Promise<void> {
  const root = await realDirectory(exportRoot);
  if (!isInsideVault(root, destination)) {
    throw pathOutsideVault();
  }
  const listed = await lstatOrNull(destination);
  if (listed === null) {
    return;
  }
  if (!force) {
    throw new GavetaError('E_PATH_EXISTS');
  }
}

async function assertReadableVaultFile(vaultRoot: string, entry: string): Promise<void> {
  const root = await realVaultRoot(vaultRoot);
  const listed = await lstat(entry);
  if (listed.isSymbolicLink()) {
    const target = await realpath(entry);
    if (!isInsideVault(root, target)) {
      throw pathOutsideVault();
    }
  }
}

async function realVaultRoot(vaultRoot: string): Promise<string> {
  try {
    const root = await realpath(vaultRoot);
    const info = await stat(root);
    if (!info.isDirectory()) {
      throw new GavetaError('E_VAULT_NOT_FOUND');
    }
    return root;
  } catch (error) {
    if (hasNodeErrorCode(error, 'ENOENT')) {
      throw new GavetaError('E_VAULT_NOT_FOUND');
    }
    throw error;
  }
}

async function resolveExportRoot(vaultRoot: string, cwd: string, userOut: string): Promise<string> {
  if (!isSafePathInput(userOut)) {
    throw new GavetaError('E_ARG_INVALID');
  }
  const absolute = path.normalize(path.isAbsolute(userOut) ? userOut : path.resolve(cwd, userOut));
  const vault = await realVaultRoot(vaultRoot);
  if (absolute === vault || isInsideVault(vault, absolute)) {
    throw new GavetaError('E_ARG_INVALID');
  }
  let probe = absolute;
  while (probe !== path.dirname(probe)) {
    try {
      const real = await realpath(probe);
      if (real === vault || isInsideVault(vault, real)) {
        throw new GavetaError('E_ARG_INVALID');
      }
      break;
    } catch (error) {
      if (error instanceof GavetaError) {
        throw error;
      }
      if (!hasNodeErrorCode(error, 'ENOENT')) {
        throw error;
      }
      probe = path.dirname(probe);
    }
  }
  return absolute;
}

export async function resolveInsideExport(exportRoot: string, userPath: string): Promise<string> {
  if (!isSafePathInput(userPath)) {
    throw pathOutsideVault();
  }
  const root = await realDirectory(exportRoot);
  const segments = splitSegments(userPath);
  let current = root;
  let entered = true;
  for (const segment of segments) {
    if (segment === '..') {
      if (!entered) {
        throw pathOutsideVault();
      }
      const parent = path.dirname(current);
      if (!isInsideVault(root, parent)) {
        throw pathOutsideVault();
      }
      current = parent;
      entered = isInsideVault(root, current);
      continue;
    }
    const next = path.join(current, segment);
    const listed = await lstatOrNull(next);
    if (listed?.isSymbolicLink()) {
      const real = await realOrThrow(next);
      if (entered && !isInsideVault(root, real)) {
        throw pathOutsideVault();
      }
      current = real;
      entered = isInsideVault(root, current);
      continue;
    }
    current = next;
    entered = isInsideVault(root, current);
  }
  if (!isInsideVault(root, current)) {
    throw pathOutsideVault();
  }
  return current;
}

function isSafePathInput(value: string): boolean {
  return !value.includes('\0');
}

function splitSegments(userPath: string): string[] {
  let body = userPath;
  if (path.isAbsolute(userPath)) {
    body = userPath.slice(path.parse(userPath).root.length);
  }
  if (path.sep === '\\') {
    body = body.replaceAll('\\', '/');
  }
  return body.split('/').filter((segment) => segment !== '' && segment !== '.');
}

async function realDirectory(target: string): Promise<string> {
  if (!isSafePathInput(target)) {
    throw pathOutsideVault();
  }
  try {
    return await realpath(target);
  } catch (error) {
    if (
      hasNodeErrorCode(error, 'ENOENT') ||
      hasNodeErrorCode(error, 'ENOTDIR') ||
      hasNodeErrorCode(error, 'ELOOP')
    ) {
      throw pathOutsideVault();
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
      throw pathOutsideVault();
    }
    throw error;
  }
}

async function lstatOrNull(target: string): Promise<import('node:fs').Stats | null> {
  try {
    return await lstat(target);
  } catch (error) {
    if (hasNodeErrorCode(error, 'ENOENT')) {
      return null;
    }
    throw error;
  }
}
