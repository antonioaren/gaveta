import { tokenizeShellLine } from './shell-tokens.ts';

export interface SkillCliCatalog {
  readonly commands: ReadonlySet<string>;
  readonly subcommands: ReadonlyMap<string, ReadonlySet<string>>;
  readonly globalFlags: ReadonlySet<string>;
  flagsFor(command: string, subcommand?: string): ReadonlySet<string>;
}

export interface SkillMentionIssue {
  readonly line: number;
  readonly snippet: string;
  readonly message: string;
}

const GAVETA_PREFIX = 'gaveta ';

function formatCommandRef(command: string, subcommand: string | undefined): string {
  return subcommand === undefined ? command : `${command} ${subcommand}`;
}

function isCliFlagToken(token: string): boolean {
  if (token.startsWith('--')) {
    return true;
  }
  return /^-[a-zA-Z]$/.test(token);
}

function lineNumberAt(text: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index; i += 1) {
    if (text[i] === '\n') {
      line += 1;
    }
  }
  return line;
}

function isWordBoundary(text: string, index: number): boolean {
  if (index === 0) {
    return true;
  }
  const prev = text[index - 1];
  if (prev === undefined) {
    return true;
  }
  return /[\s(`"'[\]]/.test(prev);
}

function extractInvocation(text: string, start: number): string | null {
  let end = start + GAVETA_PREFIX.length;
  while (end < text.length && text[end] !== '\n' && text[end] !== '`') {
    end += 1;
  }
  return text.slice(start, end).trimEnd();
}

function validateTokens(
  tokens: readonly string[],
  catalog: SkillCliCatalog,
  line: number,
  snippet: string,
): SkillMentionIssue[] {
  const issues: SkillMentionIssue[] = [];
  if (tokens.length === 0) {
    return issues;
  }
  const command = tokens[0];
  if (command === undefined) {
    return issues;
  }
  if (!catalog.commands.has(command)) {
    issues.push({
      line,
      snippet,
      message: `unknown command "${command}"`,
    });
    return issues;
  }

  let index = 1;
  let subcommand: string | undefined;
  const subs = catalog.subcommands.get(command);
  const maybeSub = tokens[index];
  if (subs !== undefined && subs.size > 0 && maybeSub !== undefined && subs.has(maybeSub)) {
    subcommand = maybeSub;
    index += 1;
  }

  const allowed = new Set([...catalog.globalFlags, ...catalog.flagsFor(command, subcommand)]);
  while (index < tokens.length) {
    const token = tokens[index];
    if (token === undefined) {
      break;
    }
    if (!isCliFlagToken(token)) {
      index += 1;
      continue;
    }
    if (!allowed.has(token)) {
      issues.push({
        line,
        snippet,
        message: `unknown flag "${token}" for gaveta ${formatCommandRef(command, subcommand)}`,
      });
    }
    index += 1;
    const value = tokens[index];
    if (value !== undefined && !value.startsWith('-')) {
      index += 1;
    }
  }
  return issues;
}

/** Fail when markdown skill text cites a CLI command or flag that is not in the catalog. */
export function findInvalidSkillMentions(
  text: string,
  catalog: SkillCliCatalog,
): SkillMentionIssue[] {
  const issues: SkillMentionIssue[] = [];
  let cursor = 0;
  while (cursor < text.length) {
    const at = text.indexOf(GAVETA_PREFIX, cursor);
    if (at === -1) {
      break;
    }
    if (!isWordBoundary(text, at)) {
      cursor = at + GAVETA_PREFIX.length;
      continue;
    }
    const invocation = extractInvocation(text, at);
    if (invocation === null) {
      cursor = at + GAVETA_PREFIX.length;
      continue;
    }
    const body = invocation.slice(GAVETA_PREFIX.length);
    const tokens = tokenizeShellLine(body);
    const line = lineNumberAt(text, at);
    issues.push(...validateTokens(tokens, catalog, line, invocation));
    cursor = at + invocation.length;
  }
  return issues;
}
