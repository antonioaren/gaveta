import { expect, it } from 'vitest';
import { agentInstructionRelativePath, mergeAgentInstructionFile } from './agent-instructions.ts';
import { AGENT_BLOCK_END, AGENT_BLOCK_START } from './agent-block.ts';

it('snapshots cursor and copilot instruction files', () => {
  const cursor = mergeAgentInstructionFile('cursor', '');
  expect(cursor).toMatchSnapshot('cursor-rule');
  expect(cursor).toContain('alwaysApply: true');
  expect(cursor).toContain(AGENT_BLOCK_START);
  expect(cursor).toContain(AGENT_BLOCK_END);

  const copilot = mergeAgentInstructionFile('copilot', '# Repo\n');
  expect(copilot).toMatchSnapshot('copilot-instructions');
  expect(copilot).toContain('# Repo');
});

it('maps each target to the file agents read', () => {
  expect(agentInstructionRelativePath('claude')).toBe('CLAUDE.md');
  expect(agentInstructionRelativePath('agents')).toBe('AGENTS.md');
  expect(agentInstructionRelativePath('cursor')).toBe('.cursor/rules/gaveta.mdc');
  expect(agentInstructionRelativePath('copilot')).toBe('.github/copilot-instructions.md');
});
