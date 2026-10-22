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

export interface MarkdownFixtureManifest {
  version: number;
  description: string;
  noteCount: number;
  notePaths: string[];
  attachments: string[];
  ignoredOnImport: string[];
  features: Record<string, MarkdownFixtureFeature>;
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
  return {
    version: 1,
    description,
    noteCount,
    notePaths,
    attachments,
    ignoredOnImport,
    features,
    intentionalBrokenLinks,
  };
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
