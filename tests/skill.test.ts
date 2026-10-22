import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { GLOBAL_CLI_FLAGS, buildCliSurface, commands } from '@gaveta/cli';
import { buildSkill, findInvalidSkillMentions, type SkillCliCatalog } from '@gaveta/core';
import * as prettier from 'prettier';
import { describe, expect, it } from 'vitest';

const root = join(import.meta.dirname, '..');
const skillRoot = join(root, 'skills', 'gaveta');

function readPackageVersion(): string {
  const raw = readFileSync(join(root, 'packages', 'cli', 'package.json'), 'utf8');
  const manifest = JSON.parse(raw) as { version: string };
  return manifest.version;
}

function guideEntriesFromRegistry(): { name: string; summary: string; example: string }[] {
  return commands.map((command) => ({
    name: command.name,
    summary: command.summary,
    example: command.example,
    ...(command.subcommands === undefined
      ? {}
      : {
          subcommands: command.subcommands.map((sub) => ({
            name: sub.name,
            summary: sub.summary,
            example: sub.example,
          })),
        }),
  }));
}

function listSkillMarkdownFiles(): string[] {
  const paths: string[] = [];
  const walk = (dir: string, prefix: string): void => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      const rel = prefix.length === 0 ? entry : `${prefix}/${entry}`;
      if (statSync(full).isDirectory()) {
        walk(full, rel);
        continue;
      }
      if (rel.endsWith('.md')) {
        paths.push(rel);
      }
    }
  };
  walk(skillRoot, '');
  return paths.sort();
}

async function formatSkillMarkdown(path: string, contents: string): Promise<string> {
  return prettier.format(contents, { filepath: join(skillRoot, path) });
}

async function fingerprint(files: { path: string; contents: string }[]): Promise<string> {
  const hash = createHash('sha256');
  const ordered = [...files].sort((left, right) => left.path.localeCompare(right.path));
  for (const file of ordered) {
    hash.update(file.path);
    hash.update('\0');
    hash.update(await formatSkillMarkdown(file.path, file.contents));
    hash.update('\0');
  }
  return hash.digest('hex');
}

function toCatalog(surface: ReturnType<typeof buildCliSurface>): SkillCliCatalog {
  return {
    commands: surface.commands,
    subcommands: surface.subcommands,
    globalFlags: GLOBAL_CLI_FLAGS,
    flagsFor: surface.flagsFor.bind(surface),
  };
}

describe('skills/gaveta bundle', () => {
  it('matches the generated bundle for the current CLI version', async () => {
    const cliVersion = readPackageVersion();
    const expected = buildSkill({ commands: guideEntriesFromRegistry(), cliVersion });
    const onDisk = expected.files.map((file) => ({
      path: file.path,
      contents: readFileSync(join(skillRoot, file.path), 'utf8'),
    }));
    expect(await fingerprint(onDisk)).toBe(await fingerprint([...expected.files]));
  });

  it('does not mention CLI commands or flags that are absent from the registry', () => {
    const catalog = toCatalog(buildCliSurface(commands));
    const issues: { path: string; issue: string }[] = [];
    for (const rel of listSkillMarkdownFiles()) {
      const text = readFileSync(join(skillRoot, rel), 'utf8');
      for (const issue of findInvalidSkillMentions(text, catalog)) {
        issues.push({
          path: rel,
          issue: `${String(issue.line)}: ${issue.message} (${issue.snippet})`,
        });
      }
    }
    expect(issues).toEqual([]);
  });
});
