/** A note named in `E_HAS_BACKLINKS` or in a move/remove result. */
export interface AffectedNote {
  readonly id: string | null;
  readonly title: string;
  readonly path: string;
}

export interface MoveNoteResult {
  readonly id: string | null;
  readonly from: string;
  readonly to: string;
  /** Vault paths whose incoming hrefs were rewritten, sorted by path. */
  readonly rewritten: readonly string[];
}

export interface RemoveNoteResult {
  readonly id: string | null;
  readonly path: string;
  readonly title: string;
  readonly forced: boolean;
  /** Vault paths whose incoming links became pending, sorted by path. */
  readonly pending: readonly string[];
}
