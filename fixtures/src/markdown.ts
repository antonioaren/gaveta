import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { FIXTURES_ROOT } from './paths.ts';

export const MARKDOWN_VAULT_DIR = 'markdown';

export interface MarkdownFixtureFeature {
  description: string;
  files: string[];
  mustContain: string[];
}

export interface MarkdownBrokenLink {
  from: string;
  kind: 'wikilink' | 'relative';
  target: string;
  reason: string;
}

export interface MarkdownRoundTripLossyNote {
  path: string;
  reason: string;
  requireImportWarnings?: WarningCodeName[];
  requireExportWarnings?: WarningCodeName[];
  requireExportLossDetails?: string[];
}

type WarningCodeName = 'W_IMPORT_UNSUPPORTED' | 'W_EXPORT_LOSSY';

export interface MarkdownRoundTripManifest {
  lossyMarkdown: MarkdownRoundTripLossyNote[];
}

export interface MarkdownFixtureManifest {
  version: number;
  description: string;
  noteCount: number;
  notePaths: string[];
  attachments: string[];
  ignoredOnImport: string[];
  features: Record<string, MarkdownFixtureFeature>;
  roundTrip: MarkdownRoundTripManifest;
  intentionalBrokenLinks: MarkdownBrokenLink[];
}

const MANIFEST_PATH = join(FIXTURES_ROOT, MARKDOWN_VAULT_DIR, 'manifest.json');

export function markdownVaultPath(): string {
  return join(FIXTURES_ROOT, MARKDOWN_VAULT_DIR);
}

export function markdownManifestPath(): string {
  return MANIFEST_PATH;
}

export function loadMarkdownManifest(): MarkdownFixtureManifest {
  const raw: unknown = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
  return assertManifest(raw);
}

function assertManifest(value: unknown): MarkdownFixtureManifest {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('manifest is not an object');
  }
  const record = value as Record<string, unknown>;
  const version = record.version;
  if (version !== 1) {
    throw new Error(`unsupported manifest version ${String(version)}`);
  }
  const description = record.description;
  if (typeof description !== 'string') {
    throw new Error('manifest.description must be a string');
  }
  const noteCount = record.noteCount;
  if (typeof noteCount !== 'number') {
    throw new Error('manifest.noteCount must be a number');
  }
  const notePaths = readStringArray(record.notePaths, 'notePaths');
  const attachments = readStringArray(record.attachments, 'attachments');
  const ignoredOnImport = readStringArray(record.ignoredOnImport, 'ignoredOnImport');
  const features = readFeatures(record.features);
  const intentionalBrokenLinks = readBrokenLinks(record.intentionalBrokenLinks);
  const roundTrip = readRoundTrip(record.roundTrip);
  return {
    version: 1,
    description,
    noteCount,
    notePaths,
    attachments,
    ignoredOnImport,
    features,
    roundTrip,
    intentionalBrokenLinks,
  };
}

function readRoundTrip(value: unknown): MarkdownRoundTripManifest {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('roundTrip must be an object');
  }
  const record = value as Record<string, unknown>;
  const lossyMarkdown = readLossyMarkdown(record.lossyMarkdown);
  return { lossyMarkdown };
}

function readLossyMarkdown(value: unknown): MarkdownRoundTripLossyNote[] {
  if (!Array.isArray(value)) {
    throw new Error('roundTrip.lossyMarkdown must be an array');
  }
  return value.map((item, index) => {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) {
      throw new Error(`roundTrip.lossyMarkdown[${String(index)}] must be an object`);
    }
    const record = item as Record<string, unknown>;
    const path = record.path;
    const reason = record.reason;
    if (typeof path !== 'string' || typeof reason !== 'string') {
      throw new Error(`roundTrip.lossyMarkdown[${String(index)}] has invalid fields`);
    }
    const requireImportWarnings = readOptionalWarningCodes(
      record.requireImportWarnings,
      index,
      'requireImportWarnings',
    );
    const requireExportWarnings = readOptionalWarningCodes(
      record.requireExportWarnings,
      index,
      'requireExportWarnings',
    );
    const requireExportLossDetails = readOptionalStringArray(
      record.requireExportLossDetails,
      index,
      'requireExportLossDetails',
    );
    const lossyNote: MarkdownRoundTripLossyNote = { path, reason };
    if (requireImportWarnings !== undefined) {
      lossyNote.requireImportWarnings = requireImportWarnings;
    }
    if (requireExportWarnings !== undefined) {
      lossyNote.requireExportWarnings = requireExportWarnings;
    }
    if (requireExportLossDetails !== undefined) {
      lossyNote.requireExportLossDetails = requireExportLossDetails;
    }
    return lossyNote;
  });
}

function readOptionalStringArray(
  value: unknown,
  index: number,
  label: string,
): string[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) {
    throw new Error(`roundTrip.lossyMarkdown[${String(index)}].${label} must be a string array`);
  }
  return value;
}

function readOptionalWarningCodes(
  value: unknown,
  index: number,
  label: string,
): WarningCodeName[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) {
    throw new Error(`roundTrip.lossyMarkdown[${String(index)}].${label} must be a string array`);
  }
  for (const item of value) {
    if (item !== 'W_IMPORT_UNSUPPORTED' && item !== 'W_EXPORT_LOSSY') {
      throw new Error(`roundTrip.lossyMarkdown[${String(index)}].${label} has invalid code`);
    }
  }
  return value as WarningCodeName[];
}

function readStringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) {
    throw new Error(`${label} must be a string array`);
  }
  return value;
}

function readFeatures(value: unknown): Record<string, MarkdownFixtureFeature> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('features must be an object');
  }
  const out: Record<string, MarkdownFixtureFeature> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      throw new Error(`features.${key} must be an object`);
    }
    const feature = entry as Record<string, unknown>;
    const description = feature.description;
    const files = readStringArray(feature.files, `features.${key}.files`);
    const mustContain = readStringArray(feature.mustContain, `features.${key}.mustContain`);
    if (typeof description !== 'string') {
      throw new Error(`features.${key}.description must be a string`);
    }
    out[key] = { description, files, mustContain };
  }
  return out;
}

function readBrokenLinks(value: unknown): MarkdownBrokenLink[] {
  if (!Array.isArray(value)) {
    throw new Error('intentionalBrokenLinks must be an array');
  }
  return value.map((entry, index) => {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      throw new Error(`intentionalBrokenLinks[${String(index)}] must be an object`);
    }
    const record = entry as Record<string, unknown>;
    const from = record.from;
    const kind = record.kind;
    const target = record.target;
    const reason = record.reason;
    if (typeof from !== 'string' || typeof target !== 'string' || typeof reason !== 'string') {
      throw new Error(`intentionalBrokenLinks[${String(index)}] has invalid fields`);
    }
    if (kind !== 'wikilink' && kind !== 'relative') {
      throw new Error(`intentionalBrokenLinks[${String(index)}].kind is invalid`);
    }
    return { from, kind, target, reason };
  });
}
