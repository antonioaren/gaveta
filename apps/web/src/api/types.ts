export interface ApiEnvelope<T> {
  readonly ok: boolean;
  readonly schemaVersion: number;
  readonly data: T;
  readonly warnings?: readonly unknown[];
}

export interface NoteListItem {
  readonly id: string | null;
  readonly path: string;
  readonly title: string;
  readonly type: 'doc' | 'slides' | 'todo' | null;
  readonly tags: readonly string[];
  readonly aliases: readonly string[];
}

export interface NotesResponse {
  readonly notes: readonly NoteListItem[];
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
  readonly type: NoteListItem['type'] | 'dashboard' | 'design' | 'artifact';
  readonly tags: readonly string[];
  readonly path: string | null;
  readonly ghost: boolean;
}

export interface GraphEdgeView {
  readonly from: string;
  readonly to: string;
  readonly rel: string | null;
}

export interface LinksResponse {
  readonly ref: string;
  readonly links: readonly OutgoingLinkView[];
}

export interface BacklinksResponse {
  readonly ref: string;
  readonly backlinks: readonly BacklinkView[];
}

export interface GraphResponse {
  readonly ref: string | null;
  readonly depth: number | null;
  readonly type: string | null;
  readonly tag: string | null;
  readonly rel: string | null;
  readonly nodes: readonly GraphNodeView[];
  readonly edges: readonly GraphEdgeView[];
}

export interface SearchHitView {
  readonly path: string;
  readonly id: string | null;
  readonly title: string;
  readonly type: NoteListItem['type'] | 'dashboard' | 'design' | 'artifact' | null;
  readonly tags: readonly string[];
  readonly snippet: string;
}

export interface SearchResponse {
  readonly query: string;
  readonly type: string | null;
  readonly tag: string | null;
  readonly limit: number;
  readonly hits: readonly SearchHitView[];
}
