import { readdirSync, readFileSync } from 'node:fs';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { importMarkdownFolder, initVault, normalizeNote } from '@gaveta/core';
import { FIXTURES_ROOT, markdownVaultPath, vaultPath, type VaultName } from '@gaveta/fixtures';
import { editorJsonToNoteHtml, noteHtmlToEditorJson } from './index.ts';

interface LoadedNote {
  readonly group: string;
  readonly path: string;
  readonly html: string;
}

function walkHtml(dir: string, root = dir): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const absolute = join(dir, entry.name);
    const path = relative(root, absolute).split(sep).join('/');
    if (entry.isDirectory()) {
      found.push(...walkHtml(absolute, root));
    } else if (entry.isFile() && entry.name.endsWith('.html')) {
      found.push(path);
    }
  }
  return found.sort();
}

function loadVaultNotes(group: string, name: VaultName): LoadedNote[] {
  return walkHtml(vaultPath(name)).map((path) => ({
    group,
    path,
    html: readFileSync(join(vaultPath(name), path), 'utf8'),
  }));
}

function loadFlatNotes(group: string, directory: string): LoadedNote[] {
  return walkHtml(directory).map((path) => ({
    group,
    path,
    html: readFileSync(join(directory, path), 'utf8'),
  }));
}

function editorRoundTrip(html: string): string {
  const json = noteHtmlToEditorJson(html);
  return editorJsonToNoteHtml(json);
}

function normalizedBytes(html: string, notePath: string): string | null {
  const result = normalizeNote(html, { notePath });
  return result.ok ? result.html : null;
}

describe('editor schema round-trip through core normalizer', () => {
  const failures: { group: string; path: string; reason: string }[] = [];

  function assertRoundTrip(note: LoadedNote): void {
    const notePath = note.path;
    const expected = normalizedBytes(note.html, notePath);
    if (expected === null) {
      failures.push({ group: note.group, path: note.path, reason: 'normalize failed on source' });
      return;
    }
    const roundHtml = editorRoundTrip(expected);
    const actual = normalizedBytes(roundHtml, notePath);
    if (actual === null) {
      failures.push({
        group: note.group,
        path: note.path,
        reason: 'normalize failed after round-trip',
      });
      return;
    }
    if (actual !== expected) {
      failures.push({
        group: note.group,
        path: note.path,
        reason: 'normalized bytes differ after editor round-trip',
      });
    }
  }

  it('vault fixtures: backlinks and problems', () => {
    const notes = [
      ...loadVaultNotes('vaults/backlinks', 'backlinks'),
      ...loadVaultNotes('vaults/problems', 'problems'),
    ];
    for (const note of notes) {
      assertRoundTrip(note);
    }
    expect(failures.filter((f) => f.group.startsWith('vaults'))).toEqual([]);
  });

  it('vault fixtures: malicious normalize to safe canonical HTML', () => {
    const notes = loadVaultNotes('vaults/malicious', 'malicious');
    for (const note of notes) {
      assertRoundTrip(note);
    }
    expect(failures.filter((f) => f.group === 'vaults/malicious')).toEqual([]);
  });

  it('showcase vitrinas', () => {
    const notes = loadFlatNotes('showcase', join(FIXTURES_ROOT, 'showcase'));
    for (const note of notes) {
      assertRoundTrip(note);
    }
    expect(failures.filter((f) => f.group === 'showcase')).toEqual([]);
  });

  it('markdown import output vault', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'gaveta-editor-md-'));
    const vaultRoot = join(parent, 'vault');
    try {
      await mkdir(vaultRoot);
      await initVault({ cwd: parent, directory: 'vault' });
      await importMarkdownFolder({ vaultRoot, sourcePath: markdownVaultPath() });
      const notes = walkHtml(vaultRoot).map((path) => ({
        group: 'markdown-import',
        path,
        html: readFileSync(join(vaultRoot, path), 'utf8'),
      }));
      for (const note of notes) {
        assertRoundTrip(note);
      }
      expect(failures.filter((f) => f.group === 'markdown-import')).toEqual([]);
    } finally {
      await rm(parent, { recursive: true, force: true });
    }
  });

  it('adopted Claude artifact types (doc, slides, dashboard, design, artifact)', async () => {
    const { copyFileSync } = await import('node:fs');
    const { adoptNote } = await import('@gaveta/core');
    const parent = await mkdtemp(join(tmpdir(), 'gaveta-editor-claude-'));
    const vaultRoot = join(parent, 'vault');
    try {
      await mkdir(vaultRoot);
      await initVault({ cwd: parent, directory: 'vault' });
      const claudeDir = join(FIXTURES_ROOT, 'claude');
      const names = ['doc.html', 'slides.html', 'dashboard.html', 'design.html', 'react-app.html'];
      for (const name of names) {
        const target = join(vaultRoot, name);
        copyFileSync(join(claudeDir, name), target);
        const source = name === 'react-app.html' ? 'claude' : 'claude';
        await adoptNote(vaultRoot, name, {
          source,
          ...(name === 'react-app.html' ? { allowCdn: true } : {}),
        });
      }
      const notes = walkHtml(vaultRoot).map((path) => ({
        group: 'claude-adopted',
        path,
        html: readFileSync(join(vaultRoot, path), 'utf8'),
      }));
      for (const note of notes) {
        assertRoundTrip(note);
      }
      expect(failures.filter((f) => f.group === 'claude-adopted')).toEqual([]);
    } finally {
      await rm(parent, { recursive: true, force: true });
    }
  });
});
