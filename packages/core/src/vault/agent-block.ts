export const AGENT_BLOCK_START = '<!-- gaveta:start -->';

export const AGENT_BLOCK_END = '<!-- gaveta:end -->';

/**
 * Short agent instructions. The full contract stays in `gaveta guide`,
 * so this block does not go stale when the contract changes.
 */
export const AGENT_INSTRUCTION_BODY = [
  '## Gaveta',
  '',
  'Este directorio es un vault de Gaveta. Las notas son archivos HTML y los enlaces entre ellas son el producto.',
  '',
  '- Busca antes de crear (`gaveta search`).',
  '- Lee el contexto con `gaveta backlinks` y `gaveta graph --depth 1`.',
  '- Escribe con `gaveta new` o `gaveta edit --from -` y enlaza con `[[Título]]`.',
  '- Usa `--json` y `--if-match` al escribir.',
  '- El contrato completo está en `gaveta guide`. No lo copies aquí.',
].join('\n');

/** Insert or replace the delimited block. A second call with the same body is a no-op. */
export function upsertAgentBlock(existing: string, body: string): string {
  const block = `${AGENT_BLOCK_START}\n${body}\n${AGENT_BLOCK_END}`;
  const located = findLastBlock(existing);
  if (located === null) {
    if (existing.length === 0) {
      return `${block}\n`;
    }
    const base = existing.endsWith('\n') ? existing : `${existing}\n`;
    const prefix = base.endsWith('\n\n') ? base : `${base}\n`;
    return `${prefix}${block}\n`;
  }
  const before = stripBlocks(existing.slice(0, located.start));
  const after = stripBlocks(existing.slice(located.end));
  const next = `${before}${block}${after}`;
  return next.endsWith('\n') ? next : `${next}\n`;
}

function findLastBlock(text: string): { start: number; end: number } | null {
  const endAt = text.lastIndexOf(AGENT_BLOCK_END);
  if (endAt === -1) {
    return null;
  }
  const startAt = text.lastIndexOf(AGENT_BLOCK_START, endAt);
  if (startAt === -1) {
    return null;
  }
  return { start: startAt, end: endAt + AGENT_BLOCK_END.length };
}

function stripBlocks(text: string): string {
  let result = '';
  let cursor = 0;
  while (cursor < text.length) {
    const start = text.indexOf(AGENT_BLOCK_START, cursor);
    if (start === -1) {
      result += text.slice(cursor);
      break;
    }
    const end = text.indexOf(AGENT_BLOCK_END, start + AGENT_BLOCK_START.length);
    if (end === -1) {
      result += text.slice(cursor);
      break;
    }
    result += text.slice(cursor, start);
    cursor = end + AGENT_BLOCK_END.length;
  }
  return result;
}
