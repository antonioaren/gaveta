import { abbreviationTracker, emmetConfig, EmmetKnownSyntax } from '@emmetio/codemirror6-plugin';
import type { Extension } from '@codemirror/state';

/** Emmet abbreviations for HTML note source (MIT emmet core). */
export function codeEditorEmmetExtensions(): Extension[] {
  const syntax = EmmetKnownSyntax.html;
  return [emmetConfig.of({ syntax }), abbreviationTracker({ syntax })];
}
