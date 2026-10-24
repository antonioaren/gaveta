import { Node } from '@tiptap/core';

export const HTML_BLOCK_NODE = 'htmlBlock';

export const HtmlBlockExtension = Node.create({
  name: HTML_BLOCK_NODE,
  group: 'block',
  atom: true,
  selectable: true,
  addAttributes() {
    return {
      html: { default: '' },
    };
  },
  parseHTML: () => [],
  renderHTML: ({ node }) => {
    const attrs: unknown = node.attrs;
    const html =
      attrs !== null &&
      typeof attrs === 'object' &&
      'html' in attrs &&
      typeof attrs.html === 'string'
        ? attrs.html
        : '';
    return ['div', { 'data-gaveta-html-block': '1', 'data-html': html }];
  },
});
