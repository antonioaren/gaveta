import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { changelogEntriesBetween } from './changelog.ts';
import { workspaceRootFromModuleUrl } from './workspace-version.ts';

it('extracts changelog sections between two versions', () => {
  const root = workspaceRootFromModuleUrl(import.meta.url);
  const markdown = readFileSync(join(root, 'CHANGELOG.md'), 'utf8');
  const entries = changelogEntriesBetween(markdown, '0.0.0', '0.1.0');
  expect(entries.map((entry) => entry.version)).toEqual(['0.1.0']);
  expect(entries[0]?.body).toContain('Monorepo');
});
