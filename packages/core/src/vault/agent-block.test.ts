import { expect, it } from 'vitest';
import {
  AGENT_BLOCK_END,
  AGENT_BLOCK_START,
  AGENT_INSTRUCTION_BODY,
  upsertAgentBlock,
} from './agent-block.ts';

const BODY = 'Busca antes de crear.\nEl contrato está en gaveta guide.';

function countOf(text: string, needle: string): number {
  let count = 0;
  let from = 0;
  while (from < text.length) {
    const at = text.indexOf(needle, from);
    if (at === -1) {
      return count;
    }
    count += 1;
    from = at + needle.length;
  }
  return count;
}

it('appends one delimited block and does not duplicate it', () => {
  const once = upsertAgentBlock('# Proyecto\n\nTexto previo.\n', BODY);
  expect(countOf(once, AGENT_BLOCK_START)).toBe(1);
  expect(countOf(once, AGENT_BLOCK_END)).toBe(1);
  expect(once).toContain('# Proyecto');
  expect(once).toContain('Texto previo.');
  expect(once).toContain(BODY);
  expect(once.endsWith('\n')).toBe(true);
  expect(upsertAgentBlock(once, BODY)).toBe(once);
});

it('replaces an outdated block and keeps the surrounding text', () => {
  const existing = [
    '# Proyecto',
    '',
    AGENT_BLOCK_START,
    'instrucciones viejas',
    AGENT_BLOCK_END,
    '',
    'Pie.',
    '',
  ].join('\n');
  const updated = upsertAgentBlock(existing, BODY);
  expect(countOf(updated, AGENT_BLOCK_START)).toBe(1);
  expect(updated).toContain('# Proyecto');
  expect(updated).toContain('Pie.');
  expect(updated).not.toContain('instrucciones viejas');
  expect(updated).toContain(BODY);
  expect(upsertAgentBlock(updated, BODY)).toBe(updated);
});

it('collapses repeated blocks into one', () => {
  const existing = [
    'intro',
    AGENT_BLOCK_START,
    'uno',
    AGENT_BLOCK_END,
    'middle',
    AGENT_BLOCK_START,
    'dos',
    AGENT_BLOCK_END,
    'tail',
    '',
  ].join('\n');
  const updated = upsertAgentBlock(existing, BODY);
  expect(countOf(updated, AGENT_BLOCK_START)).toBe(1);
  expect(countOf(updated, AGENT_BLOCK_END)).toBe(1);
  expect(updated).toContain('intro');
  expect(updated).toContain('middle');
  expect(updated).toContain('tail');
  expect(updated).not.toContain('\nuno\n');
  expect(updated).not.toContain('\ndos\n');
  expect(upsertAgentBlock(updated, BODY)).toBe(updated);
});

it('keeps prose that sits beside a stray start marker', () => {
  const existing = 'hello <!-- gaveta:start --> keep me';
  const once = upsertAgentBlock(existing, BODY);
  const twice = upsertAgentBlock(once, BODY);
  expect(twice).toBe(once);
  expect(twice).toContain('keep me');
  expect(countOf(twice, AGENT_BLOCK_END)).toBe(1);
});

it('points agents at search, context, and gaveta guide', () => {
  expect(AGENT_INSTRUCTION_BODY).toContain('gaveta search');
  expect(AGENT_INSTRUCTION_BODY).toContain('gaveta backlinks');
  expect(AGENT_INSTRUCTION_BODY).toContain('gaveta graph --depth 1');
  expect(AGENT_INSTRUCTION_BODY).toContain('[[');
  expect(AGENT_INSTRUCTION_BODY).toContain('--json');
  expect(AGENT_INSTRUCTION_BODY).toContain('--if-match');
  expect(AGENT_INSTRUCTION_BODY).toContain('gaveta guide');
  expect(AGENT_INSTRUCTION_BODY).not.toContain(AGENT_BLOCK_START);
});
