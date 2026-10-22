import { GUIDE_TOPICS, buildGuide } from '@gaveta/core';
import { describe, expect, it } from 'vitest';
import { commands } from '../registry.ts';
import { guideCommandsFromRegistry } from './guide.ts';

describe('guide command', () => {
  it('lists every registered command with an example in the guide', () => {
    const entries = guideCommandsFromRegistry(commands);
    expect(entries.map((entry) => entry.name)).toEqual(commands.map((command) => command.name));
    for (const command of commands) {
      const entry = entries.find((item) => item.name === command.name);
      expect(entry?.example).toBe(command.example);
      expect(entry?.summary).toBe(command.summary);
    }
  });

  it('prints each command example in human output', () => {
    const guide = buildGuide({
      commands: guideCommandsFromRegistry(commands),
      topic: 'comandos',
    });
    for (const command of commands) {
      expect(guide.human).toContain(command.example);
      for (const sub of command.subcommands ?? []) {
        expect(guide.human).toContain(sub.example);
      }
    }
  });

  it('exposes every guide topic as a --topic choice', () => {
    const guide = commands.find((command) => command.name === 'guide');
    const topicOption = guide?.options?.find((option) => option.name === 'topic');
    expect(topicOption?.choices).toEqual([...GUIDE_TOPICS]);
  });
});
