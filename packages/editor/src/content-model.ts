import { elementKind } from './element-kind.ts';

/** ProseMirror content expressions for contract block nodes. */
export function blockContentExpression(tag: string): string {
  if (tag === 'li') {
    return 'block+';
  }
  if (tag === 'pre') {
    return 'inline*';
  }
  if (tag === 'tr') {
    return '(th|td)+';
  }
  if (tag === 'thead' || tag === 'tbody') {
    return 'tr+';
  }
  if (tag === 'table') {
    return '(thead|tbody|tr)+';
  }
  if (tag === 'ul' || tag === 'ol') {
    return 'li+';
  }
  if (tag === 'dl') {
    return 'block+';
  }
  if (tag === 'picture') {
    return 'inline*';
  }
  if (tag === 'gaveta-kpi') {
    return 'inline*';
  }
  if (tag === 'gaveta-embed' || tag === 'iframe') {
    return '';
  }
  const kind = elementKind(tag);
  if (kind === 'textBlock' || kind === 'voidBlock') {
    return kind === 'textBlock' ? 'inline*' : '';
  }
  return 'block+';
}
