/** Normalize volatile note meta so API vs CLI creates can be compared. */
export function stripVolatileNoteHtml(html: string): string {
  const meta = (name: string) => new RegExp(`<meta name="${name}" content="[^"]*"\\s*/?>`, 'g');
  return html
    .replace(meta('gaveta:id'), '<meta name="gaveta:id" content="ID" />')
    .replace(meta('gaveta:created'), '<meta name="gaveta:created" content="NOW" />')
    .replace(meta('gaveta:modified'), '<meta name="gaveta:modified" content="NOW" />')
    .replace(meta('gaveta:updated'), '<meta name="gaveta:updated" content="NOW" />');
}
