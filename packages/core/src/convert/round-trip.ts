/**
 * Markdown / HTML round-trip helpers (REQ-MIG-11).
 *
 * Equivalence rules are documented in docs/migration-round-trip.md.
 */
import { posix } from 'node:path';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  loadMarkdownManifest,
  markdownVaultPath,
  type MarkdownRoundTripLossyNote,
} from '@gaveta/fixtures';
import remarkFrontmatter from 'remark-frontmatter';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import { unified } from 'unified';
import { visit } from 'unist-util-visit';
import type { Root as MdastRoot } from 'mdast';
import { parseNote } from '../parser.ts';
import type { WarningCode } from '../errors.ts';
import { isUlid } from '../contract.ts';
import { importMarkdownFolder } from '../import/folder.ts';
import { scanNoteFiles } from '../sqlite/scan.ts';
import { readVaultText } from '../vault/paths.ts';
import { initVault } from '../vault/init.ts';
import type { HtmlExportTarget } from './html-to-md.ts';
import { convertHtmlToMarkdown, type HtmlToMarkdownWarning } from './html-to-md.ts';
import {
  convertMarkdownToHtml,
  finalizeMarkdownHtml,
  type MarkdownConvertWarning,
} from './md-to-html.ts';

const DEFAULT_NOTE_ID = '01JB7Z3K9QX4T5M2N8V6R0WYHC';
const DEFAULT_NOW = '2026-10-22T12:00:00.000Z';

export interface MarkdownRoundTripResult {
  readonly relativePath: string;
  readonly mdastEquivalent: boolean;
  readonly importWarnings: readonly MarkdownConvertWarning[];
  readonly exportWarnings: readonly HtmlToMarkdownWarning[];
  readonly exportLossDetails: readonly string[];
}

export interface NoteSemanticSnapshot {
  readonly id: string;
  readonly title: string;
  readonly tags: readonly string[];
  readonly aliases: readonly string[];
  readonly tasks: readonly { readonly text: string; readonly checked: boolean }[];
  readonly links: readonly {
    readonly kind: string;
    readonly text: string;
    readonly targetId: string | null;
    readonly pendingTitle: string | null;
  }[];
}

export function stripMarkdownFrontMatter(markdown: string): string {
  if (!markdown.startsWith('---\n')) {
    return markdown;
  }
  const end = markdown.indexOf('\n---\n', 4);
  if (end === -1) {
    return markdown;
  }
  return markdown.slice(end + 5);
}

export function parseComparableMdast(markdown: string): MdastRoot {
  const processor = unified()
    .use(remarkParse)
    .use(remarkFrontmatter, ['yaml'])
    .use(remarkGfm, { singleTilde: false });
  const tree: MdastRoot = processor.parse(markdown);
  normalizeMdastTree(tree);
  return tree;
}

export function mdastComparableJson(tree: MdastRoot): string {
  return JSON.stringify(tree, (_key, value: unknown) => {
    if (typeof value === 'string') {
      return value.replace(/\s+/g, ' ').trim();
    }
    return value;
  });
}

export function mdastBodiesEquivalent(left: string, right: string): boolean {
  const leftBody = stripMarkdownFrontMatter(left);
  const rightBody = stripMarkdownFrontMatter(right);
  const leftTree = parseComparableMdast(leftBody);
  const rightTree = parseComparableMdast(rightBody);
  return mdastComparableJson(leftTree) === mdastComparableJson(rightTree);
}

export function roundTripMarkdownSource(
  markdown: string,
  relativePath: string,
  options: { readonly noteId?: string; readonly now?: string } = {},
): MarkdownRoundTripResult {
  const noteId = options.noteId ?? DEFAULT_NOTE_ID;
  const now = options.now ?? DEFAULT_NOW;
  const notePath = relativePath.replace(/\.md$/i, '.html');
  const converted = convertMarkdownToHtml(markdown, { sourcePath: relativePath });
  const finalized = finalizeMarkdownHtml(converted, { id: noteId, now, notePath });
  if (!finalized.ok || finalized.html === null) {
    throw new Error(`finalize failed for ${relativePath}`);
  }
  const exported = convertHtmlToMarkdown(finalized.html, { notePath });
  const mdastEquivalent = mdastBodiesEquivalent(markdown, exported.markdown);
  return {
    relativePath,
    mdastEquivalent,
    importWarnings: converted.warnings,
    exportWarnings: exported.warnings,
    exportLossDetails: exported.losses.map((loss) => loss.detail),
  };
}

export function roundTripMarkdownFixture(relativePath: string): MarkdownRoundTripResult {
  const markdown = readFileSync(join(markdownVaultPath(), relativePath), 'utf8');
  return roundTripMarkdownSource(markdown, relativePath);
}

export function listMdastEquivalentFixturePaths(): readonly string[] {
  const manifest = loadMarkdownManifest();
  const lossy = new Set(manifest.roundTrip.lossyMarkdown.map((entry) => entry.path));
  return manifest.notePaths.filter((path) => !lossy.has(path));
}

export function listLossyMarkdownFixtureNotes(): readonly MarkdownRoundTripLossyNote[] {
  return loadMarkdownManifest().roundTrip.lossyMarkdown;
}

export function listMarkdownFixtureNotePaths(): readonly string[] {
  return loadMarkdownManifest().notePaths;
}

export function lossyFixtureByPath(relativePath: string): MarkdownRoundTripLossyNote | undefined {
  return loadMarkdownManifest().roundTrip.lossyMarkdown.find(
    (entry) => entry.path === relativePath,
  );
}

export function noteSemanticSnapshot(html: string): NoteSemanticSnapshot {
  const parsed = parseNote(html);
  const note = parsed.note;
  if (note === null) {
    throw new Error('note missing from html');
  }
  const id = note.metadata.id ?? note.id ?? '';
  const title = note.title ?? note.metadata.title ?? '';
  const tags = note.metadata.tags;
  const aliases = note.metadata.aliases;
  const tasks = note.tasks.map((task) => ({
    text: task.text.trim(),
    checked: task.checked,
  }));
  const links = note.links.map((link) => ({
    kind: link.kind,
    text: link.text,
    targetId: link.targetId,
    pendingTitle: link.pendingTitle,
  }));
  return { id, title, tags, aliases, tasks, links };
}

export async function roundTripHtmlNoteInVault(options: {
  readonly vaultRoot: string;
  readonly notePath: string;
  readonly markdownRelativePath: string;
}): Promise<{ readonly before: NoteSemanticSnapshot; readonly after: NoteSemanticSnapshot }> {
  const htmlBefore = await readVaultText(options.vaultRoot, options.notePath);
  const resolveTarget = await buildVaultExportTargetResolver(options.vaultRoot);
  const exported = convertHtmlToMarkdown(htmlBefore, {
    notePath: options.notePath,
    resolveTarget,
  });
  const tempParent = join(options.vaultRoot, '..', 'round-trip-md');
  const { mkdir, writeFile, rm } = await import('node:fs/promises');
  await mkdir(tempParent, { recursive: true });
  const mdFile = join(tempParent, options.markdownRelativePath);
  await mkdir(join(tempParent, posix.dirname(options.markdownRelativePath)), { recursive: true });
  await writeFile(mdFile, exported.markdown, 'utf8');
  const inFolder = posix.dirname(options.notePath.replace(/\.html$/i, ''));
  try {
    await importMarkdownFolder({
      vaultRoot: options.vaultRoot,
      sourcePath: mdFile,
      ...(inFolder.length > 0 && inFolder !== '.' ? { in: inFolder } : {}),
      onConflict: 'overwrite',
    });
  } finally {
    await rm(tempParent, { recursive: true, force: true });
  }
  const htmlAfter = await readVaultText(options.vaultRoot, options.notePath);
  return {
    before: noteSemanticSnapshot(htmlBefore),
    after: noteSemanticSnapshot(htmlAfter),
  };
}

export async function withMarkdownImportVault(
  run: (vaultRoot: string) => Promise<void>,
): Promise<void> {
  const { mkdtemp, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const parent = await mkdtemp(join(tmpdir(), 'gaveta-roundtrip-'));
  const vaultRoot = join(parent, 'vault');
  try {
    await initVault({ cwd: parent, directory: 'vault' });
    await importMarkdownFolder({
      vaultRoot,
      sourcePath: markdownVaultPath(),
    });
    await run(vaultRoot);
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
}

export function warningCodes(
  warnings: readonly { readonly code: WarningCode }[],
): readonly WarningCode[] {
  return warnings.map((warning) => warning.code);
}

async function buildVaultExportTargetResolver(
  vaultRoot: string,
): Promise<(id: string) => HtmlExportTarget | null> {
  const scanned = await scanNoteFiles(vaultRoot);
  const map = new Map<string, HtmlExportTarget>();
  for (const file of scanned.files) {
    const html = await readVaultText(vaultRoot, file.relativePath);
    const parsed = parseNote(html);
    const note = parsed.note;
    if (note === null) {
      continue;
    }
    const id = note.metadata.id ?? note.id ?? null;
    const title = note.title ?? note.metadata.title ?? file.relativePath;
    if (id !== null && isUlid(id)) {
      map.set(id, { id, title, path: file.relativePath });
    }
  }
  return (id: string) => map.get(id) ?? null;
}

export function exportWarningDetails(
  warnings: readonly HtmlToMarkdownWarning[],
): readonly string[] {
  const details: string[] = [];
  for (const warning of warnings) {
    if (warning.code !== 'W_EXPORT_LOSSY') {
      continue;
    }
    const detail = warning.params?.detail;
    if (typeof detail === 'string') {
      details.push(detail);
    }
  }
  return details;
}

function normalizeMdastTree(tree: MdastRoot): void {
  stripPositions(tree);
  normalizeImageUrls(tree);
  normalizeWikiImageLinks(tree);
}

function stripPositions(node: MdastRoot): void {
  visit(node, (visited) => {
    if ('position' in visited) {
      delete (visited as { position?: unknown }).position;
    }
  });
}

function normalizeImageUrls(tree: MdastRoot): void {
  visit(tree, (node) => {
    if (node.type !== 'image') {
      return;
    }
    const basename = node.url.split('/').pop() ?? node.url;
    node.url = basename;
  });
}

function normalizeWikiImageLinks(tree: MdastRoot): void {
  visit(tree, (node) => {
    if (node.type !== 'link') {
      return;
    }
    const basename = node.url.split('/').pop() ?? node.url;
    if (node.url.endsWith('.png') || node.url.endsWith('.svg')) {
      node.url = basename;
    }
  });
}
