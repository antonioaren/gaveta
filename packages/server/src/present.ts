import {
  isErrorCode,
  type Backlink,
  type DoctorFinding,
  type DoctorFix,
  type Graph,
  type GraphFilters,
  type IndexedNote,
  type NoteOutline,
  type NoteType,
  type OutgoingLink,
  type ReadNoteResult,
  type SearchHit,
} from '@gaveta/core';

export interface NoteListItem {
  readonly id: string | null;
  readonly path: string;
  readonly title: string;
  readonly type: NoteType | null;
  readonly tags: readonly string[];
  readonly aliases: readonly string[];
}

export interface OutgoingLinkView {
  readonly target: {
    readonly id: string | null;
    readonly path: string | null;
    readonly title: string;
    readonly ghost: boolean;
  };
  readonly rel: string | null;
  readonly text: string;
  readonly section: string | null;
}

export interface BacklinkView {
  readonly sourcePath: string;
  readonly sourceId: string | null;
  readonly sourceTitle: string;
  readonly rel: string | null;
  readonly text: string;
  readonly section: string | null;
  readonly context: string;
}

export interface GraphNodeView {
  readonly id: string | null;
  readonly title: string;
  readonly type: NoteType | null;
  readonly tags: readonly string[];
  readonly path: string | null;
  readonly ghost: boolean;
}

export interface GraphEdgeView {
  readonly from: string;
  readonly to: string;
  readonly rel: string | null;
}

export interface SearchHitView {
  readonly path: string;
  readonly id: string | null;
  readonly title: string;
  readonly type: NoteType | null;
  readonly tags: readonly string[];
  readonly snippet: string;
}

export interface FindingView {
  readonly code: string;
  readonly message: string;
  readonly hint: string;
  readonly path: string;
  readonly details: Readonly<Record<string, string | number>> | null;
  readonly severity: 'error' | 'warning';
  readonly noteId: string | null;
}

export interface FixView {
  readonly path: string;
  readonly codes: readonly string[];
}

export function presentNoteList(notes: readonly IndexedNote[]): readonly NoteListItem[] {
  return notes
    .map((note) => ({
      id: note.id,
      path: note.path,
      title: note.title,
      type: note.type,
      tags: [...note.tags],
      aliases: [...note.aliases],
    }))
    .sort((left, right) => left.path.localeCompare(right.path));
}

export function presentRead(note: ReadNoteResult): Record<string, unknown> {
  const base = {
    id: note.id,
    path: note.path,
    title: note.title,
    type: note.type,
    hash: note.hash,
    as: note.as,
  };
  if (note.as === 'html') {
    return { ...base, html: note.html };
  }
  if (note.as === 'text') {
    return { ...base, text: note.text };
  }
  return { ...base, outline: note.outline };
}

export function presentOutgoing(link: OutgoingLink): OutgoingLinkView {
  return {
    target: {
      id: link.target.id,
      path: link.target.path,
      title: link.target.title,
      ghost: link.target.ghost,
    },
    rel: link.rel,
    text: link.text,
    section: link.sectionId,
  };
}

export function presentBacklink(link: Backlink): BacklinkView {
  return {
    sourcePath: link.sourcePath,
    sourceId: link.sourceId,
    sourceTitle: link.sourceTitle,
    rel: link.rel,
    text: link.text,
    section: link.sectionId,
    context: link.context,
  };
}

export function presentGraph(
  ref: string | undefined,
  depth: number | undefined,
  filters: GraphFilters,
  graph: Graph,
): {
  readonly ref: string | null;
  readonly depth: number | null;
  readonly type: NoteType | null;
  readonly tag: string | null;
  readonly rel: string | null;
  readonly folder: string | null;
  readonly nodes: readonly GraphNodeView[];
  readonly edges: readonly GraphEdgeView[];
} {
  return {
    ref: ref ?? null,
    depth: depth ?? null,
    type: filters.type ?? null,
    tag: filters.tag ?? null,
    rel: filters.rel ?? null,
    folder: filters.folder ?? null,
    nodes: graph.nodes.map((node) => ({
      id: node.id,
      title: node.title,
      type: node.type,
      tags: [...node.tags],
      path: node.path,
      ghost: node.ghost,
    })),
    edges: graph.edges.map((edge) => ({
      from: edge.source,
      to: edge.target,
      rel: edge.rel,
    })),
  };
}

export function presentHit(hit: SearchHit): SearchHitView {
  return {
    path: hit.path,
    id: hit.id,
    title: hit.title,
    type: hit.type,
    tags: [...hit.tags],
    snippet: hit.snippet,
  };
}

export function presentFinding(finding: DoctorFinding, noteId: string | null): FindingView {
  return {
    code: finding.code,
    message: finding.message,
    hint: finding.hint,
    path: finding.path,
    details: finding.details,
    severity: isErrorCode(finding.code) ? 'error' : 'warning',
    noteId,
  };
}

export function presentFix(fix: DoctorFix): FixView {
  return {
    path: fix.path,
    codes: [...fix.codes],
  };
}

export type { NoteOutline };
