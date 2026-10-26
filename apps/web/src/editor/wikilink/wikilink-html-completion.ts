import {
  autocompletion,
  type Completion,
  type CompletionContext,
  type CompletionResult,
  type CompletionSource,
} from '@codemirror/autocomplete';
import type { Extension } from '@codemirror/state';
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
  return (context: CompletionContext): CompletionResult | null => {
    const match = wikilinkCompletionContextBefore(context.state.doc.toString(), context.pos);
    if (match === null) {
      return null;
    }
    const from = match.from;
    const query = match.query;
    const pending = fetchCompletions(query).then((hits) =>
      hits.map((hit) => toCompletion(hit, labels)),
    );
    return {
      from,
      to: match.to,
      filter: false,
      validFor: () => false,
      options: pending as unknown as CompletionResult['options'],
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
