/**
 * Graph, outgoing-link, and backlink queries over a vault index.
 *
 * Edges come from canonical links whose target id matches a note, and from
 * pending links, which end at a ghost node. Wikilinks are returned by
 * `outgoingLinks` but are not edges: turning them into canonical or pending
 * links belongs to the resolver. Local depth walks incoming and outgoing
 * edges and never exceeds 3.
 */

import { isNoteType, type NoteType } from './contract.ts';
import { GavetaError } from './errors.ts';
import type { NoteLinkKind } from './parser.ts';
import {
  foldMatchKey,
  type IndexedLink,
  type IndexedNote,
  type IndexedSection,
  type VaultIndex,
} from './sqlite/store.ts';

/** Local graph depth is inclusive and closed at both ends. */
export const GRAPH_DEPTH_MIN = 1;
export const GRAPH_DEPTH_MAX = 3;

/** REQ-LINK-07: backlink context is at most this many characters. */
export const BACKLINK_CONTEXT_LIMIT = 200;

/** Prefix for a ghost node key. The rest of the key is the pending title. */
export const GRAPH_GHOST_PREFIX = 'ghost:';

/** True when `notePath` lies under folder segment `folder` (not a sibling prefix like `enlaces-otros`). */
export function notePathInFolder(notePath: string, folder: string): boolean {
  return notePath.startsWith(`${folder}/`);
}

const FILTER_KEYS = ['type', 'tag', 'rel', 'folder'] as const;
const LOCAL_KEYS = ['depth', 'type', 'tag', 'rel', 'folder'] as const;

export interface GraphNode {
  /** Note path, or `ghost:` plus the pending title. */
  readonly key: string;
  readonly id: string | null;
  readonly title: string;
  readonly type: NoteType | null;
  readonly tags: readonly string[];
  readonly path: string | null;
  readonly ghost: boolean;
}

export interface GraphEdge {
  readonly source: string;
  readonly target: string;
  readonly rel: string | null;
}

export interface Graph {
  readonly nodes: readonly GraphNode[];
  readonly edges: readonly GraphEdge[];
}

export interface GraphFilters {
  readonly type?: NoteType;
  readonly tag?: string;
  readonly rel?: string;
  readonly folder?: string;
}

export interface LocalGraphOptions extends GraphFilters {
  readonly depth: number;
}

export interface LinkTarget {
  readonly id: string | null;
  readonly path: string | null;
  readonly title: string;
  readonly ghost: boolean;
}

export interface OutgoingLink {
  readonly target: LinkTarget;
  readonly rel: string | null;
  readonly text: string;
  readonly sectionId: string | null;
  readonly href: string | null;
  readonly kind: NoteLinkKind;
}

export interface Backlink {
  readonly sourcePath: string;
  readonly sourceId: string | null;
  readonly sourceTitle: string;
  readonly rel: string | null;
  readonly text: string;
  readonly sectionId: string | null;
  readonly href: string | null;
  readonly context: string;
}

interface NormalizedFilters {
  readonly type: NoteType | null;
  readonly tag: string | null;
  readonly rel: string | null;
  readonly folder: string | null;
}

interface Catalog {
  readonly notes: readonly IndexedNote[];
  readonly byPath: ReadonlyMap<string, IndexedNote>;
  readonly byId: ReadonlyMap<string, readonly IndexedNote[]>;
  readonly byFold: ReadonlyMap<string, readonly IndexedNote[]>;
  readonly links: readonly IndexedLink[];
}

const EMPTY_FILTERS: NormalizedFilters = {
  type: null,
  tag: null,
  rel: null,
  folder: null,
};

export function graphGhostKey(title: string): string {
  return `${GRAPH_GHOST_PREFIX}${title}`;
}

/** Every note, plus one ghost node per distinct pending title that is still linked. */
export function globalGraph(index: VaultIndex, filters?: GraphFilters): Graph {
  const normalized =
    filters === undefined ? EMPTY_FILTERS : filtersFrom(readRecord(filters, FILTER_KEYS));
  return buildGlobal(loadCatalog(index), normalized);
}

/** Notes within `depth` hops of `ref`, following incoming and outgoing edges. */
export function localGraph(index: VaultIndex, ref: string, options: LocalGraphOptions): Graph {
  const record = readRecord(options, LOCAL_KEYS);
  const depth = requiredDepth(record);
  const noteRef = normalizeRef(ref);
  const catalog = loadCatalog(index);
  return buildLocal(catalog, resolveNote(catalog, noteRef), filtersFrom(record), depth);
}

/** Outgoing links of one note, in document order. Includes wikilinks and external hrefs. */
export function outgoingLinks(index: VaultIndex, ref: string): OutgoingLink[] {
  const noteRef = normalizeRef(ref);
  const catalog = loadCatalog(index);
  const note = resolveNote(catalog, noteRef);
  const links: OutgoingLink[] = [];
  for (const link of catalog.links) {
    if (link.path !== note.path) {
      continue;
    }
    links.push({
      target: linkTarget(link, catalog),
      rel: link.rel,
      text: link.text,
      sectionId: link.sectionId,
      href: link.href,
      kind: link.kind,
    });
  }
  return links;
}

/** Incoming canonical links, with a context snippet of at most 200 characters. */
export function backlinks(index: VaultIndex, ref: string): Backlink[] {
  const noteRef = normalizeRef(ref);
  const catalog = loadCatalog(index);
  const note = resolveNote(catalog, noteRef);
  if (note.id === null) {
    return [];
  }
  const sections = new Map<string, readonly IndexedSection[]>();
  const result: Backlink[] = [];
  for (const link of catalog.links) {
    if (link.kind !== 'canonical' || link.targetId !== note.id) {
      continue;
    }
    const source = catalog.byPath.get(link.path);
    if (source === undefined) {
      continue;
    }
    result.push({
      sourcePath: source.path,
      sourceId: source.id,
      sourceTitle: source.title,
      rel: link.rel,
      text: link.text,
      sectionId: link.sectionId,
      href: link.href,
      context: linkContext(index, catalog, link, source, sections),
    });
  }
  return result;
}

function buildGlobal(catalog: Catalog, filters: NormalizedFilters): Graph {
  const nodes: GraphNode[] = [];
  const keys = new Set<string>();
  for (const note of catalog.notes) {
    if (!noteMatches(note, filters)) {
      continue;
    }
    nodes.push(noteNode(note));
    keys.add(note.path);
  }
  const kept: GraphEdge[] = [];
  for (const edge of collectEdges(catalog)) {
    if (!relMatches(edge, filters.rel) || !keys.has(edge.source)) {
      continue;
    }
    if (!acceptsGlobalTarget(edge.target, keys, catalog)) {
      continue;
    }
    if (!keys.has(edge.target)) {
      nodes.push(ghostNode(edge.target));
      keys.add(edge.target);
    }
    kept.push(edge);
  }
  return finish(nodes, kept);
}

function buildLocal(
  catalog: Catalog,
  center: IndexedNote,
  filters: NormalizedFilters,
  depth: number,
): Graph {
  const edges = collectEdges(catalog).filter((edge) => relMatches(edge, filters.rel));
  const adjacency = new Map<string, string[]>();
  const ghostKeys = new Set<string>();
  for (const edge of edges) {
    pushNeighbor(adjacency, edge.source, edge.target);
    pushNeighbor(adjacency, edge.target, edge.source);
    rememberGhost(ghostKeys, edge.source, catalog);
    rememberGhost(ghostKeys, edge.target, catalog);
  }
  const seen = new Set<string>([center.path]);
  let frontier = [center.path];
  for (let step = 0; step < depth; step += 1) {
    const next: string[] = [];
    for (const key of frontier) {
      const neighbors = adjacency.get(key);
      if (neighbors === undefined) {
        continue;
      }
      for (const neighbor of neighbors) {
        if (seen.has(neighbor) || !canEnter(neighbor, filters, catalog, ghostKeys)) {
          continue;
        }
        seen.add(neighbor);
        next.push(neighbor);
      }
    }
    frontier = next;
  }
  const nodes: GraphNode[] = [];
  for (const note of catalog.notes) {
    if (seen.has(note.path)) {
      nodes.push(noteNode(note));
    }
  }
  for (const key of ghostKeys) {
    if (seen.has(key)) {
      nodes.push(ghostNode(key));
    }
  }
  const kept = edges.filter((edge) => seen.has(edge.source) && seen.has(edge.target));
  return finish(nodes, kept);
}

function loadCatalog(index: VaultIndex): Catalog {
  const notes = index.notes();
  const byPath = new Map<string, IndexedNote>();
  const byId = new Map<string, IndexedNote[]>();
  const byFold = new Map<string, IndexedNote[]>();
  for (const note of notes) {
    byPath.set(note.path, note);
    if (note.id !== null) {
      const existing = byId.get(note.id);
      if (existing === undefined) {
        byId.set(note.id, [note]);
      } else {
        existing.push(note);
      }
    }
    addFold(byFold, note.titleFolded, note);
    for (const alias of note.aliases) {
      addFold(byFold, foldMatchKey(alias), note);
    }
  }
  return { notes, byPath, byId, byFold, links: index.links() };
}

function resolveNote(catalog: Catalog, ref: string): IndexedNote {
  const byPath = catalog.byPath.get(ref);
  if (byPath !== undefined) {
    return byPath;
  }
  const byId = catalog.byId.get(ref) ?? [];
  if (byId.length > 1) {
    throw new GavetaError('E_REF_AMBIGUOUS');
  }
  if (byId.length === 1) {
    const match = byId[0];
    if (match !== undefined) {
      return match;
    }
  }
  const folded = catalog.byFold.get(foldMatchKey(ref)) ?? [];
  if (folded.length > 1) {
    throw new GavetaError('E_REF_AMBIGUOUS');
  }
  if (folded.length === 1) {
    const match = folded[0];
    if (match !== undefined) {
      return match;
    }
  }
  throw new GavetaError('E_REF_NOT_FOUND');
}

function collectEdges(catalog: Catalog): GraphEdge[] {
  const seen = new Set<string>();
  const edges: GraphEdge[] = [];
  for (const link of catalog.links) {
    if (!catalog.byPath.has(link.path)) {
      continue;
    }
    for (const target of edgeTargets(link, catalog.byId)) {
      const edge: GraphEdge = { source: link.path, target, rel: link.rel };
      const signature = JSON.stringify([edge.source, edge.target, edge.rel]);
      if (seen.has(signature)) {
        continue;
      }
      seen.add(signature);
      edges.push(edge);
    }
  }
  return edges;
}

function edgeTargets(
  link: IndexedLink,
  byId: ReadonlyMap<string, readonly IndexedNote[]>,
): string[] {
  if (isPending(link)) {
    const title = pendingTitle(link);
    return title.length === 0 ? [] : [graphGhostKey(title)];
  }
  if (link.kind !== 'canonical' || link.targetId === null) {
    return [];
  }
  const matches = byId.get(link.targetId);
  if (matches === undefined || matches.length === 0) {
    return [];
  }
  const targets: string[] = [];
  for (const match of matches) {
    targets.push(match.path);
  }
  return targets;
}

function linkTarget(link: IndexedLink, catalog: Catalog): LinkTarget {
  if (isPending(link)) {
    return { id: null, path: null, title: pendingTitle(link), ghost: true };
  }
  if (link.kind === 'canonical' && link.targetId !== null) {
    const matches = catalog.byId.get(link.targetId) ?? [];
    if (matches.length === 1) {
      const match = matches[0];
      if (match !== undefined) {
        return { id: match.id, path: match.path, title: match.title, ghost: false };
      }
    }
    return { id: link.targetId, path: null, title: link.text, ghost: false };
  }
  if (link.kind === 'wikilink') {
    return {
      id: null,
      path: null,
      title: link.wikilinkTitle ?? link.pendingTitle ?? link.text,
      ghost: false,
    };
  }
  if (link.kind === 'external') {
    return { id: null, path: null, title: link.href ?? link.text, ghost: false };
  }
  return { id: null, path: null, title: link.text, ghost: false };
}

function linkContext(
  index: VaultIndex,
  catalog: Catalog,
  link: IndexedLink,
  source: IndexedNote,
  cache: Map<string, readonly IndexedSection[]>,
): string {
  const scoped = sectionHaystack(link, sectionsFor(index, cache, source.path));
  const haystack = scoped ?? source.plainText;
  const occurrence = occurrenceIndex(catalog.links, link, scoped !== null);
  return snippet(haystack, link.text, occurrence, BACKLINK_CONTEXT_LIMIT);
}

function sectionHaystack(link: IndexedLink, sections: readonly IndexedSection[]): string | null {
  if (link.sectionId === null) {
    return null;
  }
  for (const section of sections) {
    if (section.sectionId !== link.sectionId) {
      continue;
    }
    if (link.text.length === 0 || section.plainText.includes(link.text)) {
      return section.plainText;
    }
  }
  return null;
}

function occurrenceIndex(
  links: readonly IndexedLink[],
  link: IndexedLink,
  scopeSection: boolean,
): number {
  let count = 0;
  for (const other of links) {
    if (other.path !== link.path || other.ordinal >= link.ordinal) {
      continue;
    }
    if (scopeSection && other.sectionId !== link.sectionId) {
      continue;
    }
    if (other.text === link.text) {
      count += 1;
    }
  }
  return count;
}

function snippet(haystack: string, needle: string, occurrence: number, limit: number): string {
  if (needle.length === 0) {
    return haystack.trim().slice(0, limit);
  }
  const start = findOccurrence(haystack, needle, occurrence);
  if (start === null) {
    return needle.slice(0, limit);
  }
  if (needle.length >= limit) {
    return haystack.slice(start, start + limit);
  }
  let from = start;
  let to = start + needle.length;
  let budget = limit - (to - from);
  while (budget > 0 && (from > 0 || to < haystack.length)) {
    if (from > 0) {
      from -= 1;
      budget -= 1;
    }
    if (budget > 0 && to < haystack.length) {
      to += 1;
      budget -= 1;
    }
  }
  return haystack.slice(from, to).trim();
}

function findOccurrence(haystack: string, needle: string, occurrence: number): number | null {
  if (needle.length === 0 || occurrence < 0) {
    return null;
  }
  let from = 0;
  for (let index = 0; index <= occurrence; index += 1) {
    const found = haystack.indexOf(needle, from);
    if (found === -1) {
      return null;
    }
    if (index === occurrence) {
      return found;
    }
    from = found + needle.length;
  }
  return null;
}

function sectionsFor(
  index: VaultIndex,
  cache: Map<string, readonly IndexedSection[]>,
  notePath: string,
): readonly IndexedSection[] {
  const cached = cache.get(notePath);
  if (cached !== undefined) {
    return cached;
  }
  const loaded = index.sections(notePath);
  cache.set(notePath, loaded);
  return loaded;
}

function noteMatches(note: IndexedNote, filters: NormalizedFilters): boolean {
  if (filters.type !== null && note.type !== filters.type) {
    return false;
  }
  if (filters.tag !== null && !note.tags.includes(filters.tag)) {
    return false;
  }
  if (filters.folder !== null && !notePathInFolder(note.path, filters.folder)) {
    return false;
  }
  return true;
}

function relMatches(edge: GraphEdge, rel: string | null): boolean {
  return rel === null || edge.rel === rel;
}

function acceptsGlobalTarget(target: string, keys: ReadonlySet<string>, catalog: Catalog): boolean {
  if (keys.has(target)) {
    return true;
  }
  return isGhostKey(target, catalog);
}

function canEnter(
  key: string,
  filters: NormalizedFilters,
  catalog: Catalog,
  ghostKeys: ReadonlySet<string>,
): boolean {
  const note = catalog.byPath.get(key);
  if (note !== undefined) {
    return noteMatches(note, filters);
  }
  return ghostKeys.has(key);
}

function rememberGhost(ghostKeys: Set<string>, key: string, catalog: Catalog): void {
  if (isGhostKey(key, catalog)) {
    ghostKeys.add(key);
  }
}

function isGhostKey(key: string, catalog: Catalog): boolean {
  return key.startsWith(GRAPH_GHOST_PREFIX) && !catalog.byPath.has(key);
}

function isPending(link: IndexedLink): boolean {
  return link.kind === 'pending' || (link.ghost && link.pendingTitle !== null);
}

function pendingTitle(link: IndexedLink): string {
  return link.pendingTitle ?? link.text;
}

function noteNode(note: IndexedNote): GraphNode {
  return {
    key: note.path,
    id: note.id,
    title: note.title,
    type: note.type,
    tags: [...note.tags],
    path: note.path,
    ghost: false,
  };
}

function ghostNode(key: string): GraphNode {
  const title = key.startsWith(GRAPH_GHOST_PREFIX) ? key.slice(GRAPH_GHOST_PREFIX.length) : key;
  return {
    key,
    id: null,
    title,
    type: null,
    tags: [],
    path: null,
    ghost: true,
  };
}

function finish(nodes: GraphNode[], edges: GraphEdge[]): Graph {
  nodes.sort((left, right) => compareText(left.key, right.key));
  edges.sort(compareEdge);
  return { nodes, edges };
}

function pushNeighbor(adjacency: Map<string, string[]>, from: string, to: string): void {
  const list = adjacency.get(from);
  if (list === undefined) {
    adjacency.set(from, [to]);
    return;
  }
  list.push(to);
}

function addFold(map: Map<string, IndexedNote[]>, key: string, note: IndexedNote): void {
  const list = map.get(key);
  if (list === undefined) {
    map.set(key, [note]);
    return;
  }
  for (const existing of list) {
    if (existing.path === note.path) {
      return;
    }
  }
  list.push(note);
}

function compareText(left: string, right: string): number {
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
}

function compareEdge(left: GraphEdge, right: GraphEdge): number {
  if (left.source !== right.source) {
    return compareText(left.source, right.source);
  }
  if (left.target !== right.target) {
    return compareText(left.target, right.target);
  }
  if (left.rel === right.rel) {
    return 0;
  }
  if (left.rel === null) {
    return -1;
  }
  if (right.rel === null) {
    return 1;
  }
  return compareText(left.rel, right.rel);
}

function filtersFrom(record: Record<string, unknown>): NormalizedFilters {
  return {
    type: optionalType(record),
    tag: optionalText(record, 'tag'),
    rel: optionalText(record, 'rel'),
    folder: optionalFolder(record),
  };
}

function optionalType(record: Record<string, unknown>): NoteType | null {
  if (!Object.hasOwn(record, 'type')) {
    return null;
  }
  const value = record.type;
  if (typeof value !== 'string' || !isNoteType(value)) {
    throw new GavetaError('E_ARG_INVALID');
  }
  return value;
}

function optionalText(record: Record<string, unknown>, key: string): string | null {
  if (!Object.hasOwn(record, key)) {
    return null;
  }
  const value = record[key];
  if (typeof value !== 'string' || value.length === 0 || value.includes('\0')) {
    throw new GavetaError('E_ARG_INVALID');
  }
  return value;
}

function optionalFolder(record: Record<string, unknown>): string | null {
  const raw = optionalText(record, 'folder');
  if (raw === null) {
    return null;
  }
  return normalizeFolder(raw);
}

function normalizeFolder(folder: string): string {
  if (folder.includes('\\') || folder.startsWith('/') || isDrivePath(folder)) {
    throw new GavetaError('E_PATH_OUTSIDE_VAULT');
  }
  let body = folder;
  if (body.endsWith('/')) {
    body = body.slice(0, -1);
  }
  if (body.length === 0) {
    throw new GavetaError('E_ARG_INVALID');
  }
  const segments = body.split('/');
  for (const segment of segments) {
    if (segment === '..') {
      throw new GavetaError('E_PATH_OUTSIDE_VAULT');
    }
    if (segment.length === 0 || segment === '.') {
      throw new GavetaError('E_ARG_INVALID');
    }
  }
  return body;
}

function isDrivePath(folder: string): boolean {
  const first = folder[0];
  const second = folder[1];
  if (first === undefined || second !== ':') {
    return false;
  }
  return (first >= 'A' && first <= 'Z') || (first >= 'a' && first <= 'z');
}

function requiredDepth(record: Record<string, unknown>): number {
  if (!Object.hasOwn(record, 'depth')) {
    throw new GavetaError('E_ARG_INVALID');
  }
  const value = record.depth;
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < GRAPH_DEPTH_MIN ||
    value > GRAPH_DEPTH_MAX
  ) {
    throw new GavetaError('E_ARG_INVALID');
  }
  return value;
}

function normalizeRef(ref: unknown): string {
  if (typeof ref !== 'string' || ref.length === 0 || ref.includes('\0')) {
    throw new GavetaError('E_ARG_INVALID');
  }
  return ref;
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
