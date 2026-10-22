export { SUGGESTION_LIMIT } from './types.ts';
export { relativeNoteHref } from './path.ts';
export { suggestNotes } from './suggest.ts';
export { GavetaRefError, resolveRef, resolveTitle } from './ref.ts';
export { assessRel } from './rel.ts';
export { resolveNoteLinks } from './rewrite.ts';

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
