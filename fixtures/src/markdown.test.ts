import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, posix, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  loadMarkdownManifest,
  markdownManifestPath,
  markdownVaultPath,
  type MarkdownBrokenLink,
} from './markdown.ts';
function walkMarkdown(dir: string, root = dir): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const absolute = join(dir, entry.name);
    const path = relative(root, absolute).split(sep).join('/');
    if (entry.isSymbolicLink()) {
      throw new Error(`unexpected symlink ${path}`);
    }
    if (entry.isDirectory()) {
      if (path === '.obsidian') {
        continue;
      }
      found.push(...walkMarkdown(absolute, root));
    } else if (entry.isFile() && entry.name.endsWith('.md') && entry.name !== 'README.md') {
      found.push(path);
    }
  }
  return found.sort();
}

function foldKey(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();
}

interface NoteIndex {
  path: string;
  titles: Set<string>;
}

function parseFrontMatterTitle(body: string): string | null {
  if (!body.startsWith('---\n')) {
    return null;
  }
  const end = body.indexOf('\n---\n', 4);
  if (end === -1) {
    return null;
  }
  const yaml = body.slice(4, end);
  for (const line of yaml.split('\n')) {
    const match = /^title:\s*(.+)$/.exec(line);
    if (match !== null) {
      const raw = match[1]?.trim() ?? '';
      const unquoted = raw.replace(/^['"]|['"]$/g, '');
      return unquoted.length > 0 ? unquoted : null;
    }
  }
  return null;
}

function parseH1(body: string): string | null {
  const withoutFm = body.startsWith('---\n') ? body.slice(body.indexOf('\n---\n', 4) + 5) : body;
  for (const line of withoutFm.split('\n')) {
    const match = /^#\s+(.+)$/.exec(line);
    if (match !== null) {
      return match[1]?.trim() ?? null;
    }
  }
  return null;
}

function titleFromFilename(path: string): string {
  const base = path.split('/').pop() ?? path;
  return base.replace(/\.md$/i, '');
}

function buildNoteIndex(paths: readonly string[], root: string): Map<string, NoteIndex> {
  const byFold = new Map<string, NoteIndex>();
  for (const path of paths) {
    const content = readFileSync(join(root, path), 'utf8');
    const titles = new Set<string>();
    const fmTitle = parseFrontMatterTitle(content);
    if (fmTitle !== null) {
      titles.add(fmTitle);
    }
    const h1 = parseH1(content);
    if (h1 !== null) {
      titles.add(h1);
    }
    titles.add(titleFromFilename(path));

    const yamlAliases = readAliasLines(content);
    for (const alias of yamlAliases) {
      titles.add(alias);
    }

    const index: NoteIndex = { path, titles };
    for (const title of titles) {
      const key = foldKey(title);
      const existing = byFold.get(key);
      if (existing !== undefined && existing.path !== path) {
        throw new Error(`duplicate title fold ${title} in ${existing.path} and ${path}`);
      }
      byFold.set(key, index);
    }
  }
  return byFold;
}

function readAliasLines(content: string): string[] {
  if (!content.startsWith('---\n')) {
    return [];
  }
  const end = content.indexOf('\n---\n', 4);
  if (end === -1) {
    return [];
  }
  const yaml = content.slice(4, end);
  const aliases: string[] = [];
  let inAliases = false;
  for (const line of yaml.split('\n')) {
    if (/^aliases:\s*$/.test(line)) {
      inAliases = true;
      continue;
    }
    if (inAliases) {
      const item = /^\s+-\s+(.+)$/.exec(line);
      if (item !== null) {
        aliases.push(item[1]?.trim() ?? '');
        continue;
      }
      if (!/^\s/.test(line)) {
        inAliases = false;
      }
    }
    const inline = /^aliases:\s*\[(.*)\]\s*$/.exec(line);
    if (inline !== null) {
      const inner = inline[1] ?? '';
      for (const part of inner.split(',')) {
        const trimmed = part.trim().replace(/^['"]|['"]$/g, '');
        if (trimmed.length > 0) {
          aliases.push(trimmed);
        }
      }
    }
  }
  return aliases;
}

function extractWikilinks(content: string): string[] {
  const links: string[] = [];
  let index = 0;
  while (index < content.length) {
    const start = content.indexOf('[[', index);
    if (start === -1) {
      break;
    }
    if (start > 0 && content[start - 1] === '!') {
      index = start + 2;
      continue;
    }
    const end = content.indexOf(']]', start + 2);
    if (end === -1) {
      break;
    }
    const inner = content.slice(start + 2, end);
    if (!inner.includes('\n') && !inner.includes('\r')) {
      links.push(inner);
    }
    index = end + 2;
  }
  return links;
}

function wikilinkTarget(inner: string): string {
  const withoutAlias = inner.split('|')[0] ?? inner;
  const withoutSection = withoutAlias.split('#')[0] ?? withoutAlias;
  return withoutSection.trim();
}

function extractMarkdownLinks(content: string): string[] {
  const hrefs: string[] = [];
  let index = 0;
  while (index < content.length) {
    const start = content.indexOf('](', index);
    if (start === -1) {
      break;
    }
    const close = content.indexOf(')', start + 2);
    if (close === -1) {
      break;
    }
    const href = content.slice(start + 2, close).trim();
    if (href.length > 0) {
      hrefs.push(href);
    }
    index = close + 1;
  }
  return hrefs;
}

function isIntentionalBroken(
  broken: readonly MarkdownBrokenLink[],
  from: string,
  kind: MarkdownBrokenLink['kind'],
  target: string,
): boolean {
  return broken.some(
    (entry) => entry.from === from && entry.kind === kind && entry.target === target,
  );
}

function resolveRelativeMd(from: string, href: string): string | null {
  const withoutHash = href.split('#')[0] ?? '';
  const pathOnly = withoutHash.split('?')[0] ?? '';
  if (pathOnly === '' || !pathOnly.toLowerCase().endsWith('.md')) {
    return null;
  }
  const resolved = posix.normalize(posix.join(posix.dirname(from), pathOnly));
  if (resolved === '..' || resolved.startsWith('../') || resolved.startsWith('/')) {
    return null;
  }
  return resolved;
}

describe('markdown vault manifest (T2.12, REQ-MIG-02)', () => {
  const root = markdownVaultPath();
  const manifest = loadMarkdownManifest();

  it('loads manifest.json from a stable path', () => {
    expect(markdownManifestPath()).toBe(join(root, 'manifest.json'));
    expect(manifest.version).toBe(1);
    expect(manifest.noteCount).toBe(manifest.notePaths.length);
  });

  it('lists every note on disk and shared attachments', () => {
    expect(walkMarkdown(root)).toEqual([...manifest.notePaths].sort());
    expect(manifest.notePaths.length).toBeGreaterThanOrEqual(50);
    for (const attachment of manifest.attachments) {
      const bytes = readFileSync(join(root, attachment));
      expect(bytes.length, attachment).toBeGreaterThan(0);
      expect(bytes.length, attachment).toBeLessThan(8 * 1024);
    }
    const png = readFileSync(join(root, 'attachments/pixel.png'));
    expect(png.subarray(0, 8)).toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    );
    expect(existsSync(join(root, '.obsidian/app.json'))).toBe(true);
  });

  it('documents each feature with content that really appears in the listed files', () => {
    for (const [featureId, feature] of Object.entries(manifest.features)) {
      expect(feature.files.length, featureId).toBeGreaterThan(0);
      const bodies = feature.files.map((file) => {
        expect(manifest.notePaths, file).toContain(file);
        return readFileSync(join(root, file), 'utf8');
      });
      const combined = bodies.join('\n');
      for (const needle of feature.mustContain) {
        const hit = bodies.some((body) => body.includes(needle)) || combined.includes(needle);
        expect(hit, `${featureId}: ${needle}`).toBe(true);
      }
    }
  });

  it('has no dangling wikilinks or relative .md links except intentional broken ones', () => {
    const index = buildNoteIndex(manifest.notePaths, root);
    const dangling: { from: string; kind: string; target: string }[] = [];

    for (const path of manifest.notePaths) {
      const content = readFileSync(join(root, path), 'utf8');
      for (const inner of extractWikilinks(content)) {
        const target = wikilinkTarget(inner);
        if (target.length === 0) {
          continue;
        }
        const hit = index.get(foldKey(target));
        if (hit === undefined) {
          const broken = isIntentionalBroken(
            manifest.intentionalBrokenLinks,
            path,
            'wikilink',
            target,
          );
          if (!broken) {
            dangling.push({ from: path, kind: 'wikilink', target });
          }
        }
      }

      for (const href of extractMarkdownLinks(content)) {
        const resolved = resolveRelativeMd(path, href);
        if (resolved === null) {
          continue;
        }
        if (!manifest.notePaths.includes(resolved)) {
          const pathOnly = (href.split('#')[0] ?? '').split('?')[0] ?? '';
          const broken = isIntentionalBroken(
            manifest.intentionalBrokenLinks,
            path,
            'relative',
            pathOnly,
          );
          if (!broken) {
            dangling.push({ from: path, kind: 'relative', target: href });
          }
        }
      }
    }

    expect(dangling).toEqual([]);
    expect(manifest.intentionalBrokenLinks.length).toBeGreaterThan(0);
  });

  it('deduplicates shared attachment bytes referenced from multiple notes', () => {
    const imagenes = readFileSync(join(root, 'contenido/imagenes.md'), 'utf8');
    expect(imagenes).toContain('![[pixel.png]]');
    expect(imagenes).toContain('../attachments/pixel.png');
    const hash = createHash('sha256')
      .update(readFileSync(join(root, 'attachments/pixel.png')))
      .digest('hex');
    const iconHash = createHash('sha256')
      .update(readFileSync(join(root, 'attachments/icono.svg')))
      .digest('hex');
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(iconHash).toMatch(/^[a-f0-9]{64}$/);
    expect(hash).not.toBe(iconHash);
  });
});
