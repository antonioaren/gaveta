import { createHash } from 'node:crypto';
import { lstat, realpath } from 'node:fs/promises';
import path from 'node:path';
import { ARTIFACT_CDN_META } from './artifact.ts';
import { convertClaudeHtml, type ClaudeConvertWarning } from './convert/claude.ts';
import { isIso8601, isUlid, type NoteType } from './contract.ts';
import { GavetaError, isErrorCode, isWarningCode, type WarningCode } from './errors.ts';
import { normalizeNote, type NormalizeNoteOptions } from './normalize.ts';
import { parseNote, type NoteDiagnostic, type NoteModel } from './parser.ts';
import { openVaultIndex, type VaultIndex } from './sqlite/store.ts';
import { createUlid } from './ulid.ts';
import { readVaultConfig } from './vault/config.ts';
import { GAVETA_DIRECTORY } from './vault/constants.ts';
import { hasNodeErrorCode } from './vault/node-error.ts';
import { readVaultText, resolveInsideVault, writeVaultText } from './vault/paths.ts';
import { validateNote, type ValidateNoteOptions } from './validate.ts';

export interface AdoptWarning {
  readonly code: WarningCode;
  readonly params?: Readonly<Record<string, string | number>>;
}

export interface AdoptedNote {
  readonly adopted: true;
  readonly id: string;
  readonly path: string;
  readonly hash: string;
  readonly type: NoteType;
  readonly title: string;
  readonly warnings: readonly AdoptWarning[];
}

export interface AdoptRejected {
  readonly adopted: false;
  readonly warnings: readonly AdoptWarning[];
}

export type AdoptResult = AdoptedNote | AdoptRejected;

export interface AdoptOptions {
  readonly now?: () => string;
  readonly createId?: () => string;
  readonly strictRel?: boolean;
  readonly source?: 'claude';
  readonly as?: NoteType;
  readonly allowCdn?: boolean;
}

interface PreparedNote {
  readonly html: string;
  readonly id: string;
  readonly type: NoteType;
  readonly title: string;
  readonly warnings: readonly AdoptWarning[];
}

/**
 * Turn an external `.html` file into a note: fill missing metadata, strip unsafe
 * markup through the normalizer, and index the result. The file is written only
 * when the result validates. An id that already belongs to another note is refused.
 */
export async function adoptNote(
  vaultRoot: string,
  userPath: string,
  options: AdoptOptions = {},
): Promise<AdoptResult> {
  if (typeof vaultRoot !== 'string' || vaultRoot.length === 0) {
    throw new GavetaError('E_ARG_INVALID');
  }
  if (typeof userPath !== 'string' || userPath.length === 0) {
    throw new GavetaError('E_ARG_INVALID');
  }
  const config = await readVaultConfig(vaultRoot);
  const root = await realpath(vaultRoot);
  const located = await locateHtml(root, userPath);
  let source = await readVaultText(root, located.relative);
  const claudeWarnings: AdoptWarning[] = [];
  let adoptOptions: AdoptOptions = options;
  if (options.source === 'claude') {
    const parsedSource = parseNote(source).note;
    const converted = convertClaudeHtml(source, {
      ...(options.as !== undefined ? { as: options.as } : {}),
      allowCdn: options.allowCdn === true,
      title: chooseTitle(parsedSource, parsedSource, located.relative),
    });
    source = wrapClaudeBody(converted.title, converted.body, converted.type, converted.allowCdn);
    claudeWarnings.push(...converted.warnings.map(claudeWarningToAdopt));
    adoptOptions = { ...options, allowCdn: options.allowCdn === true || converted.allowCdn };
  }
  const normalizeOptions: NormalizeNoteOptions = {
    notePath: located.relative,
    remoteAllowlist: config.remoteAllowlist,
  };
  const validateOptions: ValidateNoteOptions = {
    notePath: located.relative,
    remoteAllowlist: config.remoteAllowlist,
    relVocabulary: config.rel.vocabulary,
    strictRel: options.strictRel === true,
  };
  const prepared = prepareNote(source, located.relative, normalizeOptions, adoptOptions);
  const validated = validateNote(prepared.html, validateOptions);
  const warnings = mergeWarnings([
    claudeWarnings,
    prepared.warnings,
    warningsFrom(validated.diagnostics),
  ]);
  if (!validated.ok) {
    const blocking = validated.diagnostics.filter((diagnostic) => diagnostic.severity === 'error');
    const error = blocking.find((diagnostic) => isErrorCode(diagnostic.code));
    if (error !== undefined && isErrorCode(error.code)) {
      throw new GavetaError(error.code);
    }
    return { adopted: false, warnings };
  }
  const index = await openVaultIndex(root);
  try {
    const recovered = index.recovery();
    const indexedWarnings =
      recovered === null ? warnings : mergeWarnings([warnings, [{ code: 'W_INDEX_RECOVERED' }]]);
    assertUniqueId(index, prepared.id, located.relative);
    if (prepared.html !== source) {
      await writeVaultText(root, located.relative, prepared.html);
    }
    await index.upsert(located.relative);
    const indexed = index.note(located.relative);
    if (indexed?.id !== prepared.id) {
      throw new GavetaError('E_HTML_INVALID');
    }
    return {
      adopted: true,
      id: prepared.id,
      path: located.relative,
      hash: contentHash(prepared.html),
      type: prepared.type,
      title: prepared.title,
      warnings: indexedWarnings,
    };
  } finally {
    index.close();
  }
}

async function locateHtml(root: string, userPath: string): Promise<{ relative: string }> {
  const absolute = await resolveInsideVault(root, userPath);
  const relative = path.relative(root, absolute).split(path.sep).join('/');
  if (
    relative.length === 0 ||
    relative === GAVETA_DIRECTORY ||
    relative.startsWith(`${GAVETA_DIRECTORY}/`) ||
    !relative.endsWith('.html')
  ) {
    throw new GavetaError('E_ARG_INVALID');
  }
  let listed;
  try {
    listed = await lstat(absolute);
  } catch (error) {
    if (hasNodeErrorCode(error, 'ENOENT')) {
      throw new GavetaError('E_REF_NOT_FOUND');
    }
    throw error;
  }
  if (!listed.isFile() && !listed.isSymbolicLink()) {
    throw new GavetaError('E_ARG_INVALID');
  }
  return { relative };
}

function prepareNote(
  source: string,
  notePath: string,
  normalizeOptions: NormalizeNoteOptions,
  options: AdoptOptions,
): PreparedNote {
  const sourceModel = parseNote(source).note;
  const first = normalizeNote(source, normalizeOptions);
  if (first.html === null) {
    throw new GavetaError('E_HTML_INVALID');
  }
  const parsed = parseNote(first.html);
  const normalized = parsed.note;
  if (normalized === null) {
    throw new GavetaError('E_HTML_INVALID');
  }
  if (
    metadataComplete(normalized) &&
    sameIdentity(sourceModel, normalized) &&
    validateNote(first.html, { notePath }).ok
  ) {
    const type = normalized.type;
    const title = normalized.title;
    const id = normalized.id;
    if (type === null || title === null || id === null) {
      throw new GavetaError('E_META_MISSING');
    }
    return {
      html: first.html,
      id,
      type,
      title,
      warnings: warningsFrom(first.diagnostics),
    };
  }
  const fields = fieldsFor(sourceModel, normalized, first.html, notePath, options);
  const injected = replaceHead(
    first.html,
    renderHead(fields, stylesheetHref(first.html, notePath)),
  );
  const second = normalizeNote(injected, normalizeOptions);
  if (second.html === null) {
    throw new GavetaError('E_HTML_INVALID');
  }
  const check = parseNote(second.html);
  const note = check.note;
  if (note === null) {
    throw new GavetaError('E_META_MISSING');
  }
  if (note.id === null || note.type === null || note.title === null) {
    throw new GavetaError('E_META_MISSING');
  }
  return {
    html: second.html,
    id: note.id,
    type: note.type,
    title: note.title,
    warnings: mergeWarnings([warningsFrom(first.diagnostics), warningsFrom(second.diagnostics)]),
  };
}

function metadataComplete(model: NoteModel): boolean {
  return (
    model.title !== null &&
    model.title.length > 0 &&
    model.id !== null &&
    isUlid(model.id) &&
    model.type !== null &&
    model.metadata.created !== null &&
    isIso8601(model.metadata.created) &&
    (model.metadata.updated === null || isIso8601(model.metadata.updated))
  );
}

/**
 * Metadata that lives outside `<head>` is visible to the parser and invisible to
 * the normalizer. Re-adopting must keep that identity instead of minting another.
 */
function sameIdentity(source: NoteModel | null, normalized: NoteModel): boolean {
  if (source === null) {
    return true;
  }
  if (source.id !== null && isUlid(source.id) && source.id !== normalized.id) {
    return false;
  }
  if (source.type !== null && source.type !== normalized.type) {
    return false;
  }
  if (source.metadata.tags.length > 0 && normalized.metadata.tags.length === 0) {
    return false;
  }
  if (source.metadata.aliases.length > 0 && normalized.metadata.aliases.length === 0) {
    return false;
  }
  return true;
}

interface HeadFields {
  readonly title: string;
  readonly id: string;
  readonly type: NoteType;
  readonly tags: string | null;
  readonly aliases: string | null;
  readonly created: string;
  readonly updated: string | null;
  readonly artifactCdn: boolean;
}

function fieldsFor(
  source: NoteModel | null,
  normalized: NoteModel,
  html: string,
  notePath: string,
  options: AdoptOptions,
): HeadFields {
  const tags = joinList(source?.metadata.tags, normalized.metadata.tags);
  const aliases = joinList(source?.metadata.aliases, normalized.metadata.aliases);
  const updated = firstIso(source?.metadata.updated ?? null, normalized.metadata.updated);
  const inferred = inferType(html, source, normalized);
  const resolvedType = options.as ?? source?.type ?? normalized.type ?? inferred;
  return {
    title: chooseTitle(source, normalized, notePath),
    id: existingId(source) ?? existingId(normalized) ?? mintId(options),
    type: resolvedType,
    tags,
    aliases,
    created:
      firstIso(source?.metadata.created ?? null, normalized.metadata.created) ?? timestamp(options),
    updated,
    artifactCdn: options.allowCdn === true,
  };
}

function existingId(model: NoteModel | null): string | null {
  if (model?.id !== null && model?.id !== undefined && isUlid(model.id)) {
    return model.id;
  }
  return null;
}

function joinList(
  source: readonly string[] | undefined,
  normalized: readonly string[],
): string | null {
  const values = source !== undefined && source.length > 0 ? source : normalized;
  return values.length === 0 ? null : values.join(', ');
}

function firstIso(primary: string | null, fallback: string | null): string | null {
  if (primary !== null && isIso8601(primary)) {
    return primary;
  }
  if (fallback !== null && isIso8601(fallback)) {
    return fallback;
  }
  return null;
}

function chooseTitle(
  source: NoteModel | null,
  normalized: NoteModel | null,
  notePath: string,
): string {
  const titled = titledText(source) ?? titledText(normalized);
  if (titled !== null) {
    return titled;
  }
  const heading = headingText(normalized) ?? headingText(source);
  if (heading !== null) {
    return heading;
  }
  const base = path.posix.basename(notePath, '.html');
  if (base.length > 0) {
    return base;
  }
  return 'Sin título';
}

function titledText(model: NoteModel | null): string | null {
  if (model?.title !== null && model?.title !== undefined && model.title.trim().length > 0) {
    return model.title.trim();
  }
  return null;
}

function headingText(model: NoteModel | null): string | null {
  const heading = model?.headings[0];
  if (heading !== undefined && heading.text.trim().length > 0) {
    return heading.text.trim();
  }
  return null;
}

function wrapClaudeBody(title: string, body: string, type: NoteType, artifactCdn: boolean): string {
  const cdnMeta =
    type === 'artifact' && artifactCdn ? `<meta name="${ARTIFACT_CDN_META}" content="true">` : '';
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${escapeText(title)}</title><meta name="gaveta:type" content="${type}">${cdnMeta}</head><body>${body}</body></html>`;
}

function claudeWarningToAdopt(warning: ClaudeConvertWarning): AdoptWarning {
  if (warning.params === undefined) {
    return { code: warning.code };
  }
  return { code: warning.code, params: warning.params };
}

function inferType(html: string, source: NoteModel | null, normalized: NoteModel): NoteType {
  const sections = [...(source?.sections ?? []), ...normalized.sections];
  if (
    html.includes('class="slide"') ||
    sections.some((section) => section.classes.includes('slide'))
  ) {
    return 'slides';
  }
  const hasArticle = html.includes('<article');
  const hasTasks =
    html.includes('class="tasks"') ||
    (source?.tasks.length ?? 0) > 0 ||
    normalized.tasks.length > 0;
  if (hasTasks && !hasArticle) {
    return 'todo';
  }
  if (html.includes('g-dashboard') || html.includes('gaveta-kpi')) {
    return 'dashboard';
  }
  if (html.includes('g-frame')) {
    return 'design';
  }
  if (html.includes('<iframe') && html.includes('srcdoc')) {
    return 'artifact';
  }
  return 'doc';
}

function mintId(options: AdoptOptions): string {
  const id = options.createId?.() ?? createUlid();
  if (!isUlid(id)) {
    throw new GavetaError('E_ARG_INVALID');
  }
  return id;
}

function timestamp(options: AdoptOptions): string {
  const value = options.now?.() ?? new Date().toISOString();
  if (!isIso8601(value)) {
    throw new GavetaError('E_ARG_INVALID');
  }
  return value;
}

function stylesheetHref(html: string, notePath: string): string {
  const marker = 'rel="stylesheet" href="';
  const at = html.indexOf(marker);
  if (at !== -1) {
    const start = at + marker.length;
    const end = html.indexOf('"', start);
    if (end !== -1) {
      return html.slice(start, end);
    }
  }
  const depth = notePath.split('/').length - 1;
  return `${'../'.repeat(depth)}.gaveta/theme.css`;
}

function replaceHead(html: string, inner: string): string {
  const start = html.indexOf('<head>');
  const end = html.indexOf('</head>');
  if (start === -1 || end === -1 || end < start) {
    throw new GavetaError('E_HTML_INVALID');
  }
  return `${html.slice(0, start)}<head>\n${inner}\n  </head>${html.slice(end + '</head>'.length)}`;
}

function renderHead(fields: HeadFields, theme: string): string {
  const lines = ['    <meta charset="utf-8" />', `    <title>${escapeText(fields.title)}</title>`];
  lines.push(`    <meta name="gaveta:id" content="${escapeAttr(fields.id)}" />`);
  lines.push(`    <meta name="gaveta:type" content="${escapeAttr(fields.type)}" />`);
  if (fields.tags !== null) {
    lines.push(`    <meta name="gaveta:tags" content="${escapeAttr(fields.tags)}" />`);
  }
  if (fields.aliases !== null) {
    lines.push(`    <meta name="gaveta:aliases" content="${escapeAttr(fields.aliases)}" />`);
  }
  lines.push(`    <meta name="gaveta:created" content="${escapeAttr(fields.created)}" />`);
  if (fields.updated !== null) {
    lines.push(`    <meta name="gaveta:updated" content="${escapeAttr(fields.updated)}" />`);
  }
  if (fields.type === 'artifact' && fields.artifactCdn) {
    lines.push(`    <meta name="${ARTIFACT_CDN_META}" content="true" />`);
  }
  lines.push(`    <link rel="stylesheet" href="${escapeAttr(theme)}" />`);
  return lines.join('\n');
}

function escapeText(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function escapeAttr(value: string): string {
  return escapeText(value).replaceAll('"', '&quot;');
}

function assertUniqueId(index: VaultIndex, id: string, notePath: string): void {
  const clash = index.notesById(id).some((note) => note.path !== notePath);
  if (clash) {
    throw new GavetaError('E_ID_DUPLICATE');
  }
}

function warningsFrom(diagnostics: readonly NoteDiagnostic[]): AdoptWarning[] {
  const warnings: AdoptWarning[] = [];
  for (const diagnostic of diagnostics) {
    if (!isWarningCode(diagnostic.code)) {
      continue;
    }
    if (diagnostic.details === null) {
      warnings.push({ code: diagnostic.code });
      continue;
    }
    warnings.push({ code: diagnostic.code, params: diagnostic.details });
  }
  return warnings;
}

function mergeWarnings(groups: readonly (readonly AdoptWarning[])[]): AdoptWarning[] {
  const merged: AdoptWarning[] = [];
  const seen = new Set<string>();
  for (const group of groups) {
    for (const warning of group) {
      if (seen.has(warning.code)) {
        continue;
      }
      seen.add(warning.code);
      merged.push(warning);
    }
  }
  return merged;
}

function contentHash(text: string): string {
  return `sha256:${createHash('sha256').update(text, 'utf8').digest('hex')}`;
}
