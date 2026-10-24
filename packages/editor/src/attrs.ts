import type { DefaultTreeAdapterMap } from 'parse5';
import { isAllowedAttribute } from '@gaveta/core';

type ParseElement = DefaultTreeAdapterMap['element'];

export type HtmlAttrMap = Record<string, string>;

export function readElementAttrs(element: ParseElement): HtmlAttrMap {
  const attrs: HtmlAttrMap = {};
  for (const attr of element.attrs) {
    const name = attr.name;
    if (!isAllowedAttribute(element.tagName, name) && !name.startsWith('data-g-')) {
      continue;
    }
    attrs[name] = attr.value;
  }
  return attrs;
}

export function attrsToJson(attrs: HtmlAttrMap): HtmlAttrMap {
  const copy: HtmlAttrMap = {};
  for (const [key, value] of Object.entries(attrs)) {
    copy[key] = value;
  }
  return copy;
}

export function renderAttrString(attrs: HtmlAttrMap): string {
  const parts: string[] = [];
  for (const [name, value] of Object.entries(attrs)) {
    parts.push(`${name}="${escapeAttr(value)}"`);
  }
  return parts.length > 0 ? ` ${parts.join(' ')}` : '';
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}
