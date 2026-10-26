import {
  autocompletion,
  startCompletion,
  type Completion,
  type CompletionContext,
  type CompletionResult,
  type CompletionSource,
} from '@codemirror/autocomplete';
import type { Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import type { WikilinkCompletionView } from '../../api/wikilink-complete.ts';
import { wikilinkCompletionContextBefore } from './wikilink-query.ts';

export interface WikilinkHtmlAutocompleteLabels {
  readonly section: string;
  readonly aliasDetail: (alias: string) => string;
}

export function wikilinkHtmlCompletionSource(
  fetchCompletions: (query: string) => Promise<readonly WikilinkCompletionView[]>,
  labels: WikilinkHtmlAutocompleteLabels,
): CompletionSource {
  return async (context: CompletionContext): Promise<CompletionResult | null> => {
    const match = wikilinkCompletionContextBefore(context.state.doc.toString(), context.pos);
    if (match === null) {
      return null;
    }
    const hits = await fetchCompletions(match.query);
    return {
      from: match.from,
      to: match.to,
      filter: false,
      validFor: () => false,
      options: hits.map((hit) => toCompletion(hit, labels)),
    };
  };
}

function toCompletion(
  hit: WikilinkCompletionView,
  labels: WikilinkHtmlAutocompleteLabels,
): Completion {
  const insert = hit.title;
  const detail = hit.matchedBy === 'alias' ? labels.aliasDetail(hit.matchedLabel) : hit.path;
  return {
    label: hit.title,
    detail,
    type: 'text',
    section: labels.section,
    apply: `${insert}]]`,
  };
}

export function wikilinkHtmlAutocomplete(
  fetchCompletions: (query: string) => Promise<readonly WikilinkCompletionView[]>,
  labels: WikilinkHtmlAutocompleteLabels,
): Extension {
  return autocompletion({
    override: [wikilinkHtmlCompletionSource(fetchCompletions, labels)],
    activateOnTyping: true,
    maxRenderedOptions: 20,
  });
}

/** Opens completion after edits that `activateOnTyping` may miss (for example Playwright `insertText`). */
export function wikilinkHtmlAutocompleteTrigger(): Extension {
  return EditorView.updateListener.of((update) => {
    if (!update.docChanged) {
      return;
    }
    const head = update.state.selection.main.head;
    if (wikilinkCompletionContextBefore(update.state.doc.toString(), head) === null) {
      return;
    }
    startCompletion(update.view);
  });
}
