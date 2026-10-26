import {
  GavetaError,
  GRAPH_DEPTH_MAX,
  GRAPH_DEPTH_MIN,
  SEARCH_DEFAULT_LIMIT,
  SEARCH_MAX_LIMIT,
  isIso8601,
  isNoteType,
  isTaskPriority,
  type GraphFilters,
  type NoteType,
  type SearchOptions,
} from '@gaveta/core';

export function readRefQuery(value: string | undefined): string {
  if (value === undefined || value.includes('\0') || value.trim().length === 0) {
    throw new GavetaError('E_ARG_INVALID');
  }
  return value.trim();
}

export function readOptionalRefQuery(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  return readRefQuery(value);
}

export function readReadAs(value: string | undefined): 'html' | 'text' | 'outline' {
  if (value === undefined || value === 'html') {
    return 'html';
  }
  if (value === 'text' || value === 'outline') {
    return value;
  }
  throw new GavetaError('E_ARG_INVALID');
}

export function readGraphFilters(query: {
  type?: string;
  tag?: string;
  rel?: string;
  folder?: string;
}): GraphFilters {
  const filters: { type?: NoteType; tag?: string; rel?: string; folder?: string } = {};
  if (query.type !== undefined) {
    if (!isNoteType(query.type)) {
      throw new GavetaError('E_ARG_INVALID');
    }
    filters.type = query.type;
  }
  if (query.tag !== undefined) {
    if (query.tag.trim().length === 0 || query.tag !== query.tag.trim()) {
      throw new GavetaError('E_ARG_INVALID');
    }
    filters.tag = query.tag;
  }
  if (query.rel !== undefined) {
    if (query.rel.trim().length === 0) {
      throw new GavetaError('E_ARG_INVALID');
    }
    filters.rel = query.rel.trim();
  }
  if (query.folder !== undefined) {
    const folder = query.folder.trim();
    if (folder.length === 0 || query.folder !== folder) {
      throw new GavetaError('E_ARG_INVALID');
    }
    if (folder.startsWith('/') || folder.includes('\\') || folder.includes('..')) {
      throw new GavetaError('E_ARG_INVALID');
    }
    filters.folder = folder;
  }
  return filters;
}

export function readLocalDepth(value: string | undefined): number {
  if (value === undefined) {
    throw new GavetaError('E_ARG_INVALID');
  }
  if (!/^[1-3]$/u.test(value)) {
    throw new GavetaError('E_ARG_INVALID');
  }
  const depth = Number(value);
  if (depth < GRAPH_DEPTH_MIN || depth > GRAPH_DEPTH_MAX) {
    throw new GavetaError('E_ARG_INVALID');
  }
  return depth;
}

export function rejectDepthWithoutRef(depth: string | undefined, ref: string | undefined): void {
  if (ref === undefined && depth !== undefined) {
    throw new GavetaError('E_ARG_INVALID');
  }
}

const WIKILINK_COMPLETE_QUERY_MAX = 200;

export function readWikilinkCompleteQuery(value: string | undefined): string {
  if (value === undefined) {
    return '';
  }
  if (value.includes('\0') || value.length > WIKILINK_COMPLETE_QUERY_MAX) {
    throw new GavetaError('E_ARG_INVALID');
  }
  return value;
}

export function readSearchQuery(value: string | undefined): string {
  if (value === undefined || value.includes('\0') || value.trim().length === 0) {
    throw new GavetaError('E_ARG_INVALID');
  }
  return value.trim();
}

export function readSearchLimit(value: string | undefined): number {
  if (value === undefined) {
    return SEARCH_DEFAULT_LIMIT;
  }
  if (!/^[1-9]\d*$/u.test(value)) {
    throw new GavetaError('E_ARG_INVALID');
  }
  const limit = Number(value);
  if (!Number.isInteger(limit) || limit < 1 || limit > SEARCH_MAX_LIMIT) {
    throw new GavetaError('E_ARG_INVALID');
  }
  return limit;
}

export function readSearchType(value: string | undefined): NoteType | null {
  if (value === undefined) {
    return null;
  }
  if (!isNoteType(value)) {
    throw new GavetaError('E_ARG_INVALID');
  }
  return value;
}

export function readSearchTag(value: string | undefined): string | null {
  if (value === undefined) {
    return null;
  }
  if (value.trim().length === 0 || value !== value.trim()) {
    throw new GavetaError('E_ARG_INVALID');
  }
  return value;
}

export function toSearchOptions(
  type: NoteType | null,
  tag: string | null,
  limit: number,
): SearchOptions {
  const options: { type?: NoteType; tag?: string; limit?: number } = { limit };
  if (type !== null) {
    options.type = type;
  }
  if (tag !== null) {
    options.tag = tag;
  }
  return options;
}

/** Quote the whole query as one FTS5 phrase (same rule as the CLI search command). */
export function quoteFtsQuery(query: string): string {
  return `"${query.replaceAll('"', '""')}"`;
}

export interface TaskListQueryOptions {
  readonly ref?: string;
  readonly open?: boolean;
  readonly done?: boolean;
  readonly type?: NoteType;
  readonly tag?: string;
  readonly priority?: string;
  readonly dueOn?: string;
  readonly dueBefore?: string;
  readonly dueAfter?: string;
}

export function readTaskListQuery(query: {
  readonly ref?: string;
  readonly open?: string;
  readonly done?: string;
  readonly type?: string;
  readonly tag?: string;
  readonly priority?: string;
  readonly dueOn?: string;
  readonly dueBefore?: string;
  readonly dueAfter?: string;
}): TaskListQueryOptions {
  const open = readOptionalBooleanQuery(query.open);
  const done = readOptionalBooleanQuery(query.done);
  if (open && done) {
    throw new GavetaError('E_ARG_INVALID');
  }
  const options: {
    ref?: string;
    open?: boolean;
    done?: boolean;
    type?: NoteType;
    tag?: string;
    priority?: string;
    dueOn?: string;
    dueBefore?: string;
    dueAfter?: string;
  } = {};
  if (query.ref !== undefined) {
    options.ref = readRefQuery(query.ref);
  }
  if (open) {
    options.open = true;
  }
  if (done) {
    options.done = true;
  }
  if (query.type !== undefined) {
    if (!isNoteType(query.type)) {
      throw new GavetaError('E_ARG_INVALID');
    }
    options.type = query.type;
  }
  if (query.tag !== undefined) {
    const tag = readSearchTag(query.tag);
    if (tag === null) {
      throw new GavetaError('E_ARG_INVALID');
    }
    options.tag = tag;
  }
  if (query.priority !== undefined) {
    if (!isTaskPriority(query.priority)) {
      throw new GavetaError('E_ARG_INVALID');
    }
    options.priority = query.priority;
  }
  const dueOn = readOptionalDueQuery(query.dueOn);
  if (dueOn !== undefined) {
    options.dueOn = dueOn;
  }
  const dueBefore = readOptionalDueQuery(query.dueBefore);
  if (dueBefore !== undefined) {
    options.dueBefore = dueBefore;
  }
  const dueAfter = readOptionalDueQuery(query.dueAfter);
  if (dueAfter !== undefined) {
    options.dueAfter = dueAfter;
  }
  return options;
}

function readOptionalBooleanQuery(value: string | undefined): boolean {
  return value === 'true' || value === '1';
}

function readOptionalDueQuery(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!isIso8601(value)) {
    throw new GavetaError('E_ARG_INVALID');
  }
  return value.length >= 10 ? value.slice(0, 10) : value;
}
