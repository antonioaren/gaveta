// @vitest-environment jsdom
import { CompletionContext } from '@codemirror/autocomplete';
import { html } from '@codemirror/lang-html';
import { EditorState } from '@codemirror/state';
import { describe, expect, it } from 'vitest';
import {
  CONTRACT_HTML_TAG_NAMES,
  contractHtmlCompletionSource,
  isContractHtmlTagName,
} from './contract-html-completion.ts';

describe('contract-html-completion', () => {
  it('includes body and shell tags from the authoring contract', () => {
    expect(isContractHtmlTagName('section')).toBe(true);
    expect(isContractHtmlTagName('meta')).toBe(true);
    expect(isContractHtmlTagName('gaveta-embed')).toBe(true);
    expect(isContractHtmlTagName('div')).toBe(false);
    expect(isContractHtmlTagName('script')).toBe(true);
    expect(CONTRACT_HTML_TAG_NAMES.has('article')).toBe(true);
    expect(CONTRACT_HTML_TAG_NAMES.has('div')).toBe(false);
  });

  it('suggests contract tags and omits non-contract tags when completing a tag name', () => {
    const state = EditorState.create({
      doc: '<html><body><article><sec',
      extensions: [html()],
    });
    const context = new CompletionContext(state, state.doc.length, true);
    const result = contractHtmlCompletionSource(context);
    expect(result).not.toBeNull();
    if (result === null) {
      return;
    }
    const labels = result.options.map((option) =>
      typeof option.label === 'string' ? option.label : '',
    );
    expect(labels.some((label) => label === 'section' || label.startsWith('section'))).toBe(true);
    expect(labels.some((label) => label === 'div' || label.includes('div'))).toBe(false);
  });
});
