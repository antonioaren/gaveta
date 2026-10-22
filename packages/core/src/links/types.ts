import type { DiagnosticCode } from '../errors.ts';
import type { SourceLocation } from '../parser.ts';
import type { VaultIndex } from '../sqlite/store.ts';

/** A note the resolver can name in an error or a warning. */
export interface NoteRef {
  readonly id: string | null;
  readonly title: string;
  readonly path: string;
}

/** A near match. `score` is between 0 and 1, higher is closer. */
export interface NoteSuggestion extends NoteRef {
  readonly score: number;
}

export interface ResolvedRef extends NoteRef {
  readonly matchedBy: 'id' | 'path' | 'title' | 'alias';
}

/** How many similarity suggestions a miss or a pending link carries. */
export const SUGGESTION_LIMIT = 5;

export interface RelPolicy {
  readonly strict: boolean;
  readonly vocabulary: readonly string[];
}

export interface LinkDiagnostic {
  readonly code: DiagnosticCode;
  readonly severity: 'error' | 'warning';
  readonly message: string;
  readonly hint: string;
  readonly location: SourceLocation | null;
  readonly details: Readonly<Record<string, unknown>> | null;
}

export interface ResolvedLink {
  readonly kind: 'canonical' | 'pending' | 'external' | 'relative';
  readonly href: string | null;
  readonly targetId: string | null;
  readonly pendingTitle: string | null;
  readonly text: string;
  readonly rel: string | null;
  readonly section: string | null;
  readonly ghost: boolean;
  readonly broken: boolean;
  readonly repairedHref: boolean;
}

export interface ResolveNoteLinksOptions {
  readonly html: string;
  /** Vault-relative path of the note being saved. Used to build relative `href`s. */
  readonly fromPath: string;
  readonly index: VaultIndex;
  readonly rel?: RelPolicy;
  /** When false, an unresolved `[[...]]` is `E_LINK_UNRESOLVED` instead of a pending link. */
  readonly allowPending?: boolean;
}

export interface ResolveNoteLinksResult {
  readonly ok: boolean;
  readonly html: string;
  readonly links: readonly ResolvedLink[];
  readonly warnings: readonly LinkDiagnostic[];
  readonly errors: readonly LinkDiagnostic[];
}

export interface RelAssessment {
  readonly diagnostics: readonly LinkDiagnostic[];
  readonly error: boolean;
  /**
   * Full `rel` value when an external link was missing `noopener`.
   * Null means the attribute is left as it was.
   */
  readonly nextRel: string | null;
}
