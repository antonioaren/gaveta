import {
  autocompletion,
  type Completion,
  type CompletionContext,
  type CompletionResult,
} from '@codemirror/autocomplete';
import { htmlCompletionSourceWith, type TagSpec } from '@codemirror/lang-html';
import type { Extension } from '@codemirror/state';
import {
  ALLOWED_ATTRIBUTES,
  BODY_ELEMENTS,
  CONTRACT_CLASSES,
  DATA_ATTRIBUTE_PREFIX,
  DOCUMENT_SHELL,
  classifyElement,
} from '../../../../../packages/core/src/contract.ts';

const GAVETA_META_NAMES = [
  'gaveta:id',
  'gaveta:type',
  'gaveta:created',
  'gaveta:tags',
  'gaveta:aliases',
  'gaveta:updated',
  'gaveta:artifact-cdn',
  'gaveta:mermaid',
] as const;

const CALLOUT_KINDS = ['info', 'warn', 'warning', 'tip', 'note', 'danger', 'success'] as const;

const TASK_PRIORITIES = ['low', 'medium', 'high'] as const;

export const CONTRACT_HTML_TAG_NAMES: ReadonlySet<string> = new Set([
  ...BODY_ELEMENTS.map((element) => element.name),
  ...DOCUMENT_SHELL.elements,
]);

const CONTRACT_ATTRIBUTE_NAMES: ReadonlySet<string> = new Set(
  BODY_ELEMENTS.flatMap((element) => element.attributes),
);

function completionLabel(label: Completion['label']): string {
  return typeof label === 'string' ? label : '';
}

function buildContractTagSpecs(): Record<string, TagSpec> {
  const tags: Record<string, TagSpec> = {};
  for (const element of BODY_ELEMENTS) {
    const attrs: Record<string, null | readonly string[]> = {};
    for (const name of element.attributes) {
      if (name === 'class') {
        const classes = CONTRACT_CLASSES.filter((entry) =>
          entry.elements.includes(element.name),
        ).map((entry) => entry.name);
        attrs.class = classes.length > 0 ? classes : null;
        continue;
      }
      if (name === 'data-kind') {
        attrs['data-kind'] = CALLOUT_KINDS;
        continue;
      }
      if (name === 'data-g-priority') {
        attrs['data-g-priority'] = TASK_PRIORITIES;
        continue;
      }
      if (name === 'type' && element.name === 'input') {
        attrs.type = ['checkbox'];
        continue;
      }
      if (name === 'rel') {
        attrs.rel = ['related', 'depends-on', 'part-of', 'supersedes', 'references'];
        continue;
      }
      attrs[name] = null;
    }
    tags[element.name] = { attrs, globalAttrs: true };
  }

  tags.meta = {
    attrs: {
      charset: ['utf-8'],
      name: [...GAVETA_META_NAMES],
      content: null,
    },
    globalAttrs: false,
  };
  tags.link = {
    attrs: {
      rel: [DOCUMENT_SHELL.theme.rel],
      href: null,
    },
    globalAttrs: false,
  };
  tags.script = {
    attrs: {
      src: null,
      type: null,
    },
    globalAttrs: false,
  };
  tags.title = { globalAttrs: false };
  tags.html = { globalAttrs: false };
  tags.head = { globalAttrs: false };
  tags.body = { globalAttrs: false };

  return tags;
}

const htmlCompletionForContract = htmlCompletionSourceWith({
  extraTags: buildContractTagSpecs(),
});

export function isContractHtmlTagName(tagName: string): boolean {
  const place = classifyElement(tagName);
  return place === 'body' || place === 'shell';
}

function tagNameFromCompletionLabel(label: string): string | null {
  const trimmed = label.trim();
  if (trimmed.length === 0) {
    return null;
  }
  if (trimmed.startsWith('</')) {
    return trimmed.slice(2).replace(/[\s>].*/, '') || null;
  }
  if (trimmed.startsWith('<')) {
    return trimmed.slice(1).replace(/[\s>].*/, '') || null;
  }
  if (trimmed.startsWith('/')) {
    return trimmed.slice(1).replace(/[\s>].*/, '') || null;
  }
  return trimmed.replace(/[\s>].*/, '') || null;
}

function isContractAttributeName(name: string): boolean {
  if (CONTRACT_ATTRIBUTE_NAMES.has(name)) {
    return true;
  }
  if (name.startsWith(DATA_ATTRIBUTE_PREFIX) && name.length > DATA_ATTRIBUTE_PREFIX.length) {
    return true;
  }
  if (name === 'charset' || name === 'name' || name === 'content') {
    return true;
  }
  return (ALLOWED_ATTRIBUTES as readonly string[]).includes(name);
}

function filterCompletionOptions(options: readonly Completion[]): Completion[] {
  return options.filter((option) => {
    if (option.type === 'type') {
      const tag = tagNameFromCompletionLabel(completionLabel(option.label));
      if (tag === null || tag.length === 0) {
        return true;
      }
      return isContractHtmlTagName(tag);
    }
    if (option.type === 'property') {
      return isContractAttributeName(completionLabel(option.label));
    }
    return true;
  });
}

export function contractHtmlCompletionSource(context: CompletionContext): CompletionResult | null {
  const result = htmlCompletionForContract(context);
  if (result === null) {
    return null;
  }
  const options = filterCompletionOptions(result.options);
  if (options.length === 0) {
    return null;
  }
  return { ...result, options };
}

export function contractHtmlAutocomplete(contractElementDetail: string): Extension {
  return autocompletion({
    activateOnTyping: true,
    defaultKeymap: true,
    override: [
      (context) => {
        const result = contractHtmlCompletionSource(context);
        if (result === null) {
          return null;
        }
        return {
          ...result,
          options: result.options.map((option) =>
            option.type === 'type' ? { ...option, detail: contractElementDetail } : option,
          ),
        };
      },
    ],
  });
}
