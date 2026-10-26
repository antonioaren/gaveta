export { SUGGESTION_LIMIT } from './types.ts';
export { relativeNoteHref } from './path.ts';
export { completeWikilinkTargets, WIKILINK_COMPLETION_DEFAULT_LIMIT } from './wikilink-complete.ts';
export type { WikilinkCompletion } from './wikilink-complete.ts';
export { suggestNotes } from './suggest.ts';
export { GavetaRefError, resolveRef, resolveTitle } from './ref.ts';
export { assessRel } from './rel.ts';
export { resolveNoteLinks } from './rewrite.ts';
export { promotePendingAnchors, promotePendingLinks } from './promote.ts';
export { linkUnlinkedMentions, rewriteUnlinkedMentions, unlinkedMentions } from './mentions.ts';

export type {
  LinkDiagnostic,
  NoteRef,
  NoteSuggestion,
  RelAssessment,
  RelPolicy,
  ResolveNoteLinksOptions,
  ResolveNoteLinksResult,
  ResolvedLink,
  ResolvedRef,
} from './types.ts';

export type {
  PromoteAnchorsResult,
  PromotePendingNote,
  PromotePendingResult,
  PromotedAnchor,
  PromotedNote,
} from './promote.ts';

export type { MentionTarget, UnlinkedMention } from './mentions.ts';
