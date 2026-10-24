import type { JSONContent } from '@tiptap/core';

/** TipTap JSON for the note body, plus literal HTML slices for the document shell. */
export interface GavetaEditorDocument {
  readonly beforeBody: string;
  readonly afterBody: string;
  readonly body: JSONContent;
}
