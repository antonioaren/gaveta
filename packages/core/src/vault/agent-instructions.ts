import { AGENT_INSTRUCTION_BODY, upsertAgentBlock } from './agent-block.ts';

export const AGENT_INSTRUCTION_TARGETS = ['claude', 'agents', 'cursor', 'copilot', 'all'] as const;

export type AgentInstructionTarget = (typeof AGENT_INSTRUCTION_TARGETS)[number];

const CURSOR_RULE_FRONT_MATTER = [
  '---',
  'description: Instrucciones de Gaveta para agentes en este vault',
  'alwaysApply: true',
  '---',
  '',
].join('\n');

export function isAgentInstructionTarget(value: string): value is AgentInstructionTarget {
  for (const target of AGENT_INSTRUCTION_TARGETS) {
    if (target === value) {
      return true;
    }
  }
  return false;
}

export function expandAgentInstructionTargets(
  target: AgentInstructionTarget,
): readonly Exclude<AgentInstructionTarget, 'all'>[] {
  if (target === 'all') {
    return ['claude', 'agents', 'cursor', 'copilot'];
  }
  return [target];
}

export function agentInstructionRelativePath(
  target: Exclude<AgentInstructionTarget, 'all'>,
): string {
  switch (target) {
    case 'claude':
      return 'CLAUDE.md';
    case 'agents':
      return 'AGENTS.md';
    case 'cursor':
      return '.cursor/rules/gaveta.mdc';
    case 'copilot':
      return '.github/copilot-instructions.md';
  }
}

/** Merge the delimited Gaveta block into an agent instruction file. */
export function mergeAgentInstructionFile(
  target: Exclude<AgentInstructionTarget, 'all'>,
  existing: string,
): string {
  if (target === 'cursor' && existing.length === 0) {
    return `${CURSOR_RULE_FRONT_MATTER}${upsertAgentBlock('', AGENT_INSTRUCTION_BODY)}`;
  }
  return upsertAgentBlock(existing, AGENT_INSTRUCTION_BODY);
}
