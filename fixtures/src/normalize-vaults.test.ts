import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import { normalizeNote, parseNote, validateNote, type NoteModel } from '@gaveta/core';
import { NFR_SEED, NFR_SQLITE_NOTE_INDEX, generateVault } from './generate.ts';
import { themeHrefFor, vaultPath, type VaultName } from './paths.ts';

interface LoadedNote {
  readonly path: string;
  readonly html: string;
}

function walk(dir: string, root = dir): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const absolute = join(dir, entry.name);
    const path = relative(root, absolute).split(sep).join('/');
    if (entry.isDirectory()) {
      found.push(...walk(absolute, root));
    } else if (entry.isFile()) {
      found.push(path);
    }
  }
  return found.sort();
}

function loadNotes(name: VaultName): LoadedNote[] {
  return walk(vaultPath(name))
    .filter((path) => path.endsWith('.html'))
    .map((path) => ({
      path,
      html: readFileSync(join(vaultPath(name), path), 'utf8'),
    }));
}

function signature(note: NoteModel | null): unknown {
  if (note === null) {
    return null;
  }
  return {
    title: note.title,
    id: note.id,
    type: note.type,
    created: note.metadata.created,
    updated: note.metadata.updated,
    tags: note.metadata.tags,
    aliases: note.metadata.aliases,
    plainText: note.plainText,
    headings: note.headings.map((heading) => ({
      level: heading.level,
      text: heading.text,
      sectionId: heading.sectionId,
    })),
    sections: note.sections.map((section) => ({
      id: section.id,
      classes: section.classes,
      plainText: section.plainText,
    })),
    links: note.links.map((link) => ({
      kind: link.kind,
      text: link.text,
      href: link.href,
      targetId: link.targetId,
      pendingTitle: link.pendingTitle,
      rel: link.rel,
      wikilink: link.wikilink,
    })),
    tasks: note.tasks.map((task) => ({
      id: task.id,
      text: task.text,
      checked: task.checked,
      due: task.due,
      priority: task.priority,
    })),
  };
}

describe('normalizeNote on fixture vaults', () => {
  it('keeps valid fixture notes stable and idempotent', () => {
    const notes = [...loadNotes('backlinks'), ...loadNotes('problems')];
    const stable: string[] = [];
    for (const note of notes) {
      const before = validateNote(note.html, { notePath: note.path });
      if (!before.ok) {
        continue;
      }
      const result = normalizeNote(note.html, { notePath: note.path });
      expect(result.ok, note.path).toBe(true);
      const html = result.html ?? '';
      const theme = themeHrefFor(note.path);
      const parsed = signature(parseNote(html).note);
      const original = signature(parseNote(note.html).note);
      expect(parsed, note.path).toEqual(original);
      expect(html, note.path).toContain(`href="${theme}"`);
      expect(normalizeNote(html, { notePath: note.path }).html, note.path).toBe(html);
      expect(validateNote(html, { notePath: note.path }).ok, note.path).toBe(true);
      if (note.html.includes(`href="${theme}"`)) {
        expect(html, note.path).toBe(note.html);
        stable.push(note.path);
      }
    }
    expect(stable).toContain('nota-x.html');
    expect(stable).toContain('formas-de-enlace.html');
    expect(stable).toContain('enlaces/enlace-01.html');
    expect(stable).toContain('enlaces/mas/enlace-20.html');
    expect(stable).not.toContain('anidada/ruta-del-tema.html');
  });

  it('turns malicious fixtures into notes that validate and do not keep the payload', () => {
    for (const note of loadNotes('malicious')) {
      const result = normalizeNote(note.html, { notePath: note.path });
      const html = result.html ?? '';
      expect(result.ok, note.path).toBe(true);
      expect(validateNote(html, { notePath: note.path }).ok, note.path).toBe(true);
      const lower = html.toLowerCase();
      expect(lower, note.path).not.toContain('<script');
      expect(lower, note.path).not.toContain('javascript:');
      expect(lower, note.path).not.toContain('<iframe');
      expect(lower, note.path).not.toContain('<object');
      expect(lower, note.path).not.toContain('<embed');
      expect(lower, note.path).not.toContain('<form');
      expect(lower, note.path).not.toContain('<base');
      expect(html, note.path).not.toContain('evil.example');
      expect(html, note.path).not.toContain('onerror=');
      expect(html, note.path).not.toContain('onclick=');
      expect(html, note.path).not.toContain('onload=');
      expect(html, note.path).not.toContain('/etc/passwd');
      expect(html, note.path).not.toContain('expression(');
      expect(normalizeNote(html, { notePath: note.path }).html, note.path).toBe(html);
      expect(html, note.path).toContain(`href="${themeHrefFor(note.path)}"`);
    }
  });

  it('leaves generated notes stable', () => {
    const files = generateVault({ noteCount: 1000, seed: NFR_SEED });
    const indexes = [0, 1, NFR_SQLITE_NOTE_INDEX, 99, 100, 999];
    for (const index of indexes) {
      const path = `notes/${String(Math.floor(index / 100)).padStart(2, '0')}/nota-${String(index).padStart(4, '0')}.html`;
      const file = files.find((entry) => entry.path === path);
      expect(file, path).toBeDefined();
      if (file === undefined) {
        continue;
      }
      const result = normalizeNote(file.contents, { notePath: file.path });
      expect(result.html, path).toBe(file.contents);
      expect(signature(parseNote(result.html ?? '').note), path).toEqual(
        signature(parseNote(file.contents).note),
      );
    }
  });
});
