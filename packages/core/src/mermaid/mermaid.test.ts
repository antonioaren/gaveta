import { parse } from 'parse5';
import type { DefaultTreeAdapterMap } from 'parse5';
import { describe, expect, it } from 'vitest';
import {
  MERMAID_BOOT_ROLE,
  MERMAID_LIB_ROLE,
  MERMAID_SCRIPT_ATTR,
  expectedMermaidScriptSrc,
} from './assets.ts';
import {
  buildMermaidPre,
  isTrustedMermaidScript,
  normalizeMermaidInTree,
  readMermaidSourceFromDiv,
  readMermaidSourceFromPre,
  sanitizeMermaidSource,
} from './normalize.ts';

type ParseElement = DefaultTreeAdapterMap['element'];

function element(html: string, tagName?: string): ParseElement {
  const document = parse(html, { scriptingEnabled: false });
  const stack: DefaultTreeAdapterMap['childNode'][] = [...document.childNodes];
  while (stack.length > 0) {
    const node = stack.pop();
    if (node === undefined) {
      continue;
    }
    if (
      node.nodeName === '#text' ||
      node.nodeName === '#comment' ||
      node.nodeName === '#documentType'
    ) {
      continue;
    }
    const elementNode = node as ParseElement;
    if (tagName === undefined || elementNode.tagName.toLowerCase() === tagName) {
      return elementNode;
    }
    for (let index = elementNode.childNodes.length - 1; index >= 0; index -= 1) {
      const child = elementNode.childNodes[index];
      if (child !== undefined) {
        stack.push(child);
      }
    }
  }
  throw new Error('no element');
}

describe('sanitizeMermaidSource', () => {
  it('drops javascript click and link directives', () => {
    const input = [
      'graph LR',
      '  A-->B',
      'click A call javascript:alert(1)',
      'link B "javascript:alert(2)"',
    ].join('\n');
    expect(sanitizeMermaidSource(input)).toBe('graph LR\n  A-->B');
  });

  it('keeps safe click handlers', () => {
    const input = 'graph LR\n  A-->B\nclick A call callback()';
    expect(sanitizeMermaidSource(input)).toBe(input);
  });
});

describe('mermaid detection', () => {
  it('reads canonical pre.mermaid', () => {
    const source = readMermaidSourceFromPre(
      element('<pre class="mermaid">graph LR\n  A-->B</pre>', 'pre'),
    );
    expect(source).toBe('graph LR\n  A-->B');
  });

  it('reads pre with language-mermaid code child', () => {
    const source = readMermaidSourceFromPre(
      element(
        '<pre><code class="language-mermaid">sequenceDiagram\n  A->>B: hi</code></pre>',
        'pre',
      ),
    );
    expect(source).toBe('sequenceDiagram\n  A->>B: hi');
  });

  it('reads div.mermaid blocks', () => {
    const source = readMermaidSourceFromDiv(
      element('<div class="mermaid">flowchart TD\n  X-->Y</div>', 'div'),
    );
    expect(source).toBe('flowchart TD\n  X-->Y');
  });
});

describe('normalizeMermaidInTree', () => {
  it('normalizes fenced and div variants to pre.mermaid', () => {
    const fenced = buildMermaidPre('graph LR\n  A-->B');
    const { nodes, changed } = normalizeMermaidInTree([
      {
        kind: 'element',
        tag: 'pre',
        attrs: [],
        void: false,
        children: [
          {
            kind: 'element',
            tag: 'code',
            attrs: [{ name: 'class', value: 'language-mermaid' }],
            void: false,
            children: [{ kind: 'text', value: 'graph LR\n  A-->B' }],
          },
        ],
      },
      {
        kind: 'element',
        tag: 'div',
        attrs: [{ name: 'class', value: 'mermaid' }],
        void: false,
        children: [{ kind: 'text', value: 'sequenceDiagram\n  A->>B: ping' }],
      },
    ]);
    expect(changed).toBe(true);
    expect(nodes).toHaveLength(2);
    expect(nodes[0]).toEqual(fenced);
    expect(nodes[1]).toEqual(buildMermaidPre('sequenceDiagram\n  A->>B: ping'));
  });
});

describe('isTrustedMermaidScript', () => {
  it('accepts vendored defer scripts with data-gaveta roles', () => {
    const notePath = 'notes/diagrama.html';
    const lib = element(
      `<script defer ${MERMAID_SCRIPT_ATTR}="${MERMAID_LIB_ROLE}" src="${expectedMermaidScriptSrc(notePath, MERMAID_LIB_ROLE)}"></script>`,
      'script',
    );
    const boot = element(
      `<script defer ${MERMAID_SCRIPT_ATTR}="${MERMAID_BOOT_ROLE}" src="${expectedMermaidScriptSrc(notePath, MERMAID_BOOT_ROLE)}"></script>`,
      'script',
    );
    expect(isTrustedMermaidScript(lib, notePath)).toBe(true);
    expect(isTrustedMermaidScript(boot, notePath)).toBe(true);
  });

  it('rejects arbitrary script tags', () => {
    expect(
      isTrustedMermaidScript(
        element('<script src="https://cdn.jsdelivr.net/npm/mermaid"></script>'),
      ),
    ).toBe(false);
    expect(
      isTrustedMermaidScript(
        element(`<script ${MERMAID_SCRIPT_ATTR}="${MERMAID_LIB_ROLE}">alert(1)</script>`),
      ),
    ).toBe(false);
  });
});
