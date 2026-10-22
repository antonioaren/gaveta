import { compareCliVersions } from './skill-install.ts';

const SECTION_HEADING = /^## \[([^\]]+)\]/;

/**
 * Return Keep a Changelog section bodies strictly between two SemVer versions (exclusive from, inclusive to).
 */
export function changelogEntriesBetween(
  markdown: string,
  fromVersion: string,
  toVersion: string,
): readonly { readonly version: string; readonly body: string }[] {
  const sections = parseChangelogSections(markdown);
  const entries: { version: string; body: string }[] = [];
  for (const section of sections) {
    if (compareCliVersions(section.version, fromVersion) <= 0) {
      continue;
    }
    if (compareCliVersions(section.version, toVersion) > 0) {
      continue;
    }
    entries.push(section);
  }
  entries.sort((left, right) => compareCliVersions(left.version, right.version));
  return entries;
}

function parseChangelogSections(markdown: string): { version: string; body: string }[] {
  const lines = markdown.split('\n');
  const sections: { version: string; body: string }[] = [];
  let currentVersion: string | null = null;
  let bodyLines: string[] = [];
  for (const line of lines) {
    const match = SECTION_HEADING.exec(line);
    if (match !== null) {
      if (currentVersion !== null) {
        sections.push({ version: currentVersion, body: bodyLines.join('\n').trim() });
      }
      currentVersion = match[1]?.trim() ?? '';
      bodyLines = [];
      continue;
    }
    if (currentVersion !== null) {
      bodyLines.push(line);
    }
  }
  if (currentVersion !== null) {
    sections.push({ version: currentVersion, body: bodyLines.join('\n').trim() });
  }
  return sections.filter((section) => /^\d+\.\d+\.\d+$/.test(section.version));
}
