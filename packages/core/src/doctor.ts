/**
 * Vault health scan: broken and pending links, orphans, duplicate ids, invalid notes,
 * stale canonical hrefs, and wrong theme paths. `--fix` repairs href and theme only.
 */
import { realpath } from 'node:fs/promises';
import { parse } from 'parse5';
import type { DefaultTreeAdapterMap } from 'parse5';
import { formatDiagnostic, GavetaError, isErrorCode, type DiagnosticCode } from './errors.ts';
import { appendFragment, fragmentOf, relativeNoteHref } from './links/path.ts';
import { resolveNoteLinks } from './links/index.ts';
import { normalizeNote } from './normalize.ts';
import type { NoteDiagnostic } from './parser.ts';
import {
  openVaultIndex,
  type IndexedLink,
  type IndexedNote,
  type VaultIndex,
} from './sqlite/store.ts';
import { readVaultConfig } from './vault/config.ts';
import { readVaultText, writeVaultText } from './vault/paths.ts';
import { validateNote, type ValidateNoteOptions } from './validate.ts';

type ParseChild = DefaultTreeAdapterMap['childNode'];
type ParseElement = DefaultTreeAdapterMap['element'];

const THEME_FILE = '.gaveta/theme.css';

export interface DoctorFinding {
  readonly code: DiagnosticCode;
  readonly message: string;
  readonly hint: string;
  readonly path: string;
  readonly details: Readonly<Record<string, string | number>> | null;
}

export interface DoctorFix {
  readonly path: string;
  readonly codes: readonly DiagnosticCode[];
}

export interface DoctorReport {
  readonly ok: boolean;
  readonly findings: readonly DoctorFinding[];
  readonly fixed: readonly DoctorFix[];
}

export interface DoctorVaultOptions {
  readonly fix?: boolean;
  readonly strictRel?: boolean;
}

interface PlannedFix {
  readonly path: string;
  readonly original: string;
  readonly html: string;
  readonly codes: readonly DiagnosticCode[];
}

interface Catalog {
  readonly notes: readonly IndexedNote[];
  readonly links: readonly IndexedLink[];
  readonly byId: ReadonlyMap<string, readonly IndexedNote[]>;
}

/**
 * Scan a vault for link and note health problems. With `fix: true`, rewrite stale
 * canonical hrefs and theme paths deterministically; other findings are reported only.
 */
export async function doctorVault(
  vaultRoot: string,
  options: DoctorVaultOptions = {},
): Promise<DoctorReport> {
  if (typeof vaultRoot !== 'string' || vaultRoot.length === 0) {
    throw new GavetaError('E_ARG_INVALID');
  }
  const config = await readVaultConfig(vaultRoot);
  const root = await realpath(vaultRoot);
  const index = await openVaultIndex(root);
  try {
    await index.rebuild();
    const validateOptions: ValidateNoteOptions = {
      remoteAllowlist: config.remoteAllowlist,
      relVocabulary: config.rel.vocabulary,
      strictRel: options.strictRel === true,
    };
    const relPolicy = { strict: options.strictRel === true, vocabulary: config.rel.vocabulary };
    let catalog = loadCatalog(index);
    let findings = await collectFindings(root, index, catalog, validateOptions);
    let fixed: DoctorFix[] = [];
    if (options.fix === true) {
      const planned = await planFixes(root, index, findings, validateOptions, relPolicy);
      if (planned.length > 0) {
        await commitFixes(root, index, planned);
        fixed = planned.map((file) => ({ path: file.path, codes: file.codes }));
        catalog = loadCatalog(index);
        findings = await collectFindings(root, index, catalog, validateOptions);
      }
    }
    return {
      ok: findings.every((finding) => !isErrorCode(finding.code)),
      findings,
      fixed,
    };
  } finally {
    index.close();
  }
}

function loadCatalog(index: VaultIndex): Catalog {
  const notes = index.notes();
  const links = index.links();
  const byId = new Map<string, IndexedNote[]>();
  for (const note of notes) {
    if (note.id === null) {
      continue;
    }
    const existing = byId.get(note.id);
    if (existing === undefined) {
      byId.set(note.id, [note]);
    } else {
      existing.push(note);
    }
  }
  return { notes, links, byId };
}

async function collectFindings(
  root: string,
  index: VaultIndex,
  catalog: Catalog,
  validateOptions: ValidateNoteOptions,
): Promise<DoctorFinding[]> {
  const findings: DoctorFinding[] = [];
  findings.push(...linkFindings(catalog));
  findings.push(...duplicateFindings(index));
  findings.push(...orphanFindings(catalog));
  findings.push(...(await noteFindings(root, catalog, validateOptions)));
  return sortFindings(findings);
}

function linkFindings(catalog: Catalog): DoctorFinding[] {
  const findings: DoctorFinding[] = [];
  for (const link of catalog.links) {
    if (link.kind === 'pending' || (link.ghost && link.pendingTitle !== null)) {
      const title = link.pendingTitle ?? link.text;
      const text = formatDiagnostic('W_LINK_PENDING');
      findings.push({
        code: 'W_LINK_PENDING',
        message: text.message,
        hint: text.hint,
        path: link.path,
        details: { title, ordinal: link.ordinal },
      });
      continue;
    }
    if (link.kind !== 'canonical' || link.targetId === null) {
      continue;
    }
    const matches = catalog.byId.get(link.targetId) ?? [];
    if (matches.length === 0) {
      const text = formatDiagnostic('E_LINK_BROKEN');
      findings.push({
        code: 'E_LINK_BROKEN',
        message: text.message,
        hint: text.hint,
        path: link.path,
        details: {
          targetId: link.targetId,
          href: link.href ?? '',
          ordinal: link.ordinal,
        },
      });
      continue;
    }
    if (matches.length > 1 || link.href === null) {
      continue;
    }
    const target = matches[0];
    if (target === undefined) {
      continue;
    }
    const relative = relativeNoteHref(link.path, target.path);
    if (relative === null) {
      continue;
    }
    const expected = appendFragment(relative, fragmentOf(link.href));
    if (link.href !== expected) {
      const text = formatDiagnostic('W_LINK_HREF_STALE');
      findings.push({
        code: 'W_LINK_HREF_STALE',
        message: text.message,
        hint: text.hint,
        path: link.path,
        details: {
          href: link.href,
          target: target.path,
          ordinal: link.ordinal,
        },
      });
    }
  }
  return findings;
}

async function noteFindings(
  root: string,
  catalog: Catalog,
  validateOptions: ValidateNoteOptions,
): Promise<DoctorFinding[]> {
  const findings: DoctorFinding[] = [];
  for (const note of catalog.notes) {
    const html = await readVaultText(root, note.path);
    findings.push(...themeFindings(note.path, html));
    const validated = validateNote(html, { ...validateOptions, notePath: note.path });
    for (const diagnostic of validated.diagnostics) {
      if (!isErrorCode(diagnostic.code)) {
        continue;
      }
      if (diagnostic.code === 'E_ID_DUPLICATE') {
        continue;
      }
      const text = formatDiagnostic(diagnostic.code, diagnostic.details ?? {});
      findings.push({
        code: diagnostic.code,
        message: text.message,
        hint: text.hint,
        path: note.path,
        details: diagnosticDetails(diagnostic),
      });
    }
  }
  return findings;
}

function themeFindings(notePath: string, html: string): DoctorFinding[] {
  const themeHref = readThemeHref(html);
  const expected = expectedThemeHref(notePath);
  if (themeHref === expected) {
    return [];
  }
  const text = formatDiagnostic('W_THEME_HREF');
  return [
    {
      code: 'W_THEME_HREF',
      message: text.message,
      hint: text.hint,
      path: notePath,
      details: { href: themeHref ?? '', expected },
    },
  ];
}

function diagnosticDetails(
  diagnostic: NoteDiagnostic,
): Readonly<Record<string, string | number>> | null {
  if (diagnostic.details === null) {
    return null;
  }
  const details: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(diagnostic.details)) {
    if (typeof value === 'string' || typeof value === 'number') {
      details[key] = value;
    }
  }
  return Object.keys(details).length === 0 ? null : details;
}

function duplicateFindings(index: VaultIndex): DoctorFinding[] {
  const findings: DoctorFinding[] = [];
  const text = formatDiagnostic('E_ID_DUPLICATE');
  for (const duplicate of index.duplicates()) {
    const paths = [...duplicate.paths].sort();
    const first = paths[0];
    if (first === undefined) {
      continue;
    }
    findings.push({
      code: 'E_ID_DUPLICATE',
      message: text.message,
      hint: text.hint,
      path: first,
      details: { id: duplicate.id, paths: paths.join(',') },
    });
  }
  return findings;
}

function orphanFindings(catalog: Catalog): DoctorFinding[] {
  const referenced = new Set<string>();
  for (const link of catalog.links) {
    if (link.kind !== 'canonical' || link.targetId === null) {
      continue;
    }
    const matches = catalog.byId.get(link.targetId) ?? [];
    if (matches.length === 1) {
      referenced.add(link.targetId);
    }
  }
  const findings: DoctorFinding[] = [];
  const text = formatDiagnostic('W_NOTE_ORPHAN');
  for (const note of catalog.notes) {
    if (note.id === null) {
      continue;
    }
    const outgoing = catalog.links.some(
      (link) =>
        link.path === note.path &&
        (link.kind === 'canonical' ||
          link.kind === 'pending' ||
          link.kind === 'wikilink' ||
          (link.ghost && link.pendingTitle !== null)),
    );
    if (!outgoing && !referenced.has(note.id)) {
      findings.push({
        code: 'W_NOTE_ORPHAN',
        message: text.message,
        hint: text.hint,
        path: note.path,
        details: null,
      });
    }
  }
  return findings;
}

async function planFixes(
  root: string,
  index: VaultIndex,
  findings: readonly DoctorFinding[],
  validateOptions: ValidateNoteOptions,
  relPolicy: { readonly strict: boolean; readonly vocabulary: readonly string[] },
): Promise<PlannedFix[]> {
  const stalePaths = new Set(
    findings
      .filter((finding) => finding.code === 'W_LINK_HREF_STALE')
      .map((finding) => finding.path),
  );
  const themePaths = new Set(
    findings.filter((finding) => finding.code === 'W_THEME_HREF').map((finding) => finding.path),
  );
  const targets = new Set([...stalePaths, ...themePaths]);
  const planned: PlannedFix[] = [];
  for (const notePath of [...targets].sort((left, right) =>
    left < right ? 1 : left > right ? -1 : 0,
  )) {
    const original = await readVaultText(root, notePath);
    let html = original;
    const codes: DiagnosticCode[] = [];
    if (stalePaths.has(notePath)) {
      const resolved = resolveNoteLinks({
        html,
        fromPath: notePath,
        index,
        rel: relPolicy,
        allowPending: true,
      });
      if (!resolved.ok) {
        continue;
      }
      if (resolved.html !== html) {
        html = resolved.html;
        codes.push('W_LINK_HREF_STALE');
      }
    }
    if (themePaths.has(notePath)) {
      const normalized = normalizeNote(html, {
        notePath,
        ...(validateOptions.remoteAllowlist === undefined
          ? {}
          : { remoteAllowlist: validateOptions.remoteAllowlist }),
      });
      if (normalized.html !== null && normalized.html !== html) {
        html = normalized.html;
        codes.push('W_THEME_HREF');
      }
    }
    if (html === original || codes.length === 0) {
      continue;
    }
    planned.push({ path: notePath, original, html, codes });
  }
  return planned;
}

async function commitFixes(
  root: string,
  index: VaultIndex,
  planned: readonly PlannedFix[],
): Promise<void> {
  const written: PlannedFix[] = [];
  try {
    for (const file of planned) {
      await writeVaultText(root, file.path, file.html);
      written.push(file);
    }
    for (const file of written) {
      await index.upsert(file.path);
    }
  } catch (error) {
    await restoreFixes(root, index, written);
    throw error;
  }
}

async function restoreFixes(
  root: string,
  index: VaultIndex,
  written: readonly PlannedFix[],
): Promise<void> {
  for (const file of [...written].reverse()) {
    await writeVaultText(root, file.path, file.original);
  }
  for (const file of written) {
    await index.upsert(file.path);
  }
}

function sortFindings(findings: readonly DoctorFinding[]): DoctorFinding[] {
  return [...findings].sort((left, right) => {
    if (left.path !== right.path) {
      return left.path < right.path ? -1 : 1;
    }
    if (left.code !== right.code) {
      return left.code < right.code ? -1 : 1;
    }
    const leftOrdinal = left.details?.ordinal;
    const rightOrdinal = right.details?.ordinal;
    if (leftOrdinal !== undefined && rightOrdinal !== undefined && leftOrdinal !== rightOrdinal) {
      return leftOrdinal < rightOrdinal ? -1 : 1;
    }
    return 0;
  });
}

function expectedThemeHref(notePath: string): string {
  const depth = notePath.split('/').length - 1;
  return `${'../'.repeat(depth)}${THEME_FILE}`;
}

function readThemeHref(html: string): string | null {
  const bom = html.startsWith('\uFEFF');
  const source = bom ? html.slice(1) : html;
  let document;
  try {
    document = parse(source, { scriptingEnabled: false });
  } catch {
    return null;
  }
  const head = findHead(document);
  if (head === null) {
    return null;
  }
  for (const child of head.childNodes) {
    if (!isElement(child) || child.tagName.toLowerCase() !== 'link') {
      continue;
    }
    const rel = attribute(child, 'rel');
    if (rel?.toLowerCase() !== 'stylesheet') {
      continue;
    }
    const href = attribute(child, 'href');
    if (href?.includes(THEME_FILE) === true) {
      return href;
    }
  }
  return null;
}

function findHead(document: DefaultTreeAdapterMap['document']): ParseElement | null {
  for (const child of document.childNodes) {
    if (!isElement(child) || child.tagName.toLowerCase() !== 'html') {
      continue;
    }
    for (const inner of child.childNodes) {
      if (isElement(inner) && inner.tagName.toLowerCase() === 'head') {
        return inner;
      }
    }
  }
  return null;
}

function attribute(element: ParseElement, name: string): string | null {
  const target = name.toLowerCase();
  for (const attr of element.attrs) {
    if (attr.name.toLowerCase() === target) {
      return attr.value;
    }
  }
  return null;
}

function isElement(node: ParseChild): node is ParseElement {
  return (
    node.nodeName !== '#text' && node.nodeName !== '#comment' && node.nodeName !== '#documentType'
  );
}
