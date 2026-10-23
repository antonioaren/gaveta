import { comparePath } from '../links/path.ts';
import { parseNote, type NoteSection } from '../parser.ts';
import { noteContentHash } from '../notes.ts';
import { foldMatchKey } from '../sqlite/schema.ts';
import type { IndexedNote, IndexedSection, VaultIndex } from '../sqlite/store.ts';
import { GavetaError } from '../errors.ts';

export interface OverlayNote {
  readonly path: string;
  readonly html: string;
}

interface FlatSection {
  readonly ordinal: number;
  readonly parentOrdinal: number | null;
  readonly sectionId: string | null;
  readonly heading: string | null;
  readonly level: number | null;
  readonly plainText: string;
}

export function withImportOverlay(
  base: VaultIndex,
  overlayNotes: readonly OverlayNote[],
): VaultIndex {
  const state = buildOverlayState(overlayNotes);
  const handler: ProxyHandler<VaultIndex> = {
    get(_target, property, receiver) {
      if (property === 'note') {
        return (notePath: string) => state.byPath.get(notePath) ?? base.note(notePath);
      }
      if (property === 'notes') {
        return () => mergeNotes(base.notes(), state);
      }
      if (property === 'notesById') {
        return (id: string) => mergeById(base.notesById(id), state, id);
      }
      if (property === 'notesMatchingTitle') {
        return (title: string) => mergeTitle(base.notesMatchingTitle(title), state, title);
      }
      if (property === 'pathsMatchingAlias') {
        return (alias: string) => mergeAliasPaths(base.pathsMatchingAlias(alias), state, alias);
      }
      if (property === 'sections') {
        return (notePath: string) => state.sections.get(notePath) ?? base.sections(notePath);
      }
      if (property === 'aliases') {
        return (notePath?: string) => {
          if (notePath !== undefined) {
            const note = state.byPath.get(notePath);
            if (note !== undefined) {
              return note.aliases.map((alias) => ({
                path: notePath,
                alias,
                aliasFolded: foldMatchKey(alias),
              }));
            }
          }
          return base.aliases(notePath);
        };
      }
      const value: unknown = Reflect.get(base, property, receiver);
      return value;
    },
  };
  return new Proxy(base, handler);
}

function buildOverlayState(overlayNotes: readonly OverlayNote[]): {
  readonly byPath: Map<string, IndexedNote>;
  readonly byId: Map<string, IndexedNote[]>;
  readonly byTitleFold: Map<string, IndexedNote[]>;
  readonly byAliasFold: Map<string, string[]>;
  readonly sections: Map<string, IndexedSection[]>;
} {
  const byPath = new Map<string, IndexedNote>();
  const byId = new Map<string, IndexedNote[]>();
  const byTitleFold = new Map<string, IndexedNote[]>();
  const byAliasFold = new Map<string, string[]>();
  const sections = new Map<string, IndexedSection[]>();
  for (const entry of overlayNotes) {
    const indexed = indexedFromHtml(entry.path, entry.html);
    byPath.set(entry.path, indexed.note);
    pushMap(byId, indexed.note.id ?? '', indexed.note);
    pushMap(byTitleFold, indexed.note.titleFolded, indexed.note);
    for (const alias of indexed.note.aliases) {
      const folded = foldMatchKey(alias);
      const paths = byAliasFold.get(folded) ?? [];
      if (!paths.includes(entry.path)) {
        paths.push(entry.path);
        byAliasFold.set(folded, paths);
      }
    }
    sections.set(entry.path, indexed.sections);
  }
  return { byPath, byId, byTitleFold, byAliasFold, sections };
}

function indexedFromHtml(
  notePath: string,
  html: string,
): { readonly note: IndexedNote; readonly sections: IndexedSection[] } {
  const parsed = parseNote(html);
  if (!parsed.ok || parsed.note === null) {
    throw new GavetaError('E_HTML_INVALID');
  }
  const model = parsed.note;
  const title = model.title ?? '';
  const hash = noteContentHash(html);
  const note: IndexedNote = {
    path: notePath,
    id: model.id,
    title,
    titleFolded: foldMatchKey(title),
    type: model.type,
    created: model.metadata.created,
    updated: model.metadata.updated,
    tags: model.metadata.tags,
    aliases: model.metadata.aliases,
    plainText: model.plainText,
    contentHash: hash,
    mtimeMs: 0,
    sizeBytes: html.length,
  };
  const flat: FlatSection[] = [];
  flattenSections(model.sections, null, flat);
  const indexedSections: IndexedSection[] = flat.map((section) => ({
    path: notePath,
    ordinal: section.ordinal,
    sectionId: section.sectionId,
    heading: section.heading,
    level: section.level,
    plainText: section.plainText,
    parentOrdinal: section.parentOrdinal,
  }));
  return { note, sections: indexedSections };
}

function flattenSections(
  sections: readonly NoteSection[],
  parent: number | null,
  out: FlatSection[],
): void {
  for (const section of sections) {
    const ordinal = out.length;
    out.push({
      ordinal,
      parentOrdinal: parent,
      sectionId: section.id,
      heading: section.heading?.text ?? null,
      level: section.heading?.level ?? null,
      plainText: section.plainText,
    });
    flattenSections(section.children, ordinal, out);
  }
}

function mergeNotes(
  base: IndexedNote[],
  state: ReturnType<typeof buildOverlayState>,
): IndexedNote[] {
  const merged = new Map<string, IndexedNote>();
  for (const note of base) {
    merged.set(note.path, note);
  }
  for (const note of state.byPath.values()) {
    merged.set(note.path, note);
  }
  return [...merged.values()].sort((left, right) => comparePath(left.path, right.path));
}

function mergeById(
  base: IndexedNote[],
  state: ReturnType<typeof buildOverlayState>,
  id: string,
): IndexedNote[] {
  const merged = new Map<string, IndexedNote>();
  for (const note of base) {
    merged.set(note.path, note);
  }
  for (const note of state.byId.get(id) ?? []) {
    merged.set(note.path, note);
  }
  return [...merged.values()].sort((left, right) => comparePath(left.path, right.path));
}

function mergeTitle(
  base: IndexedNote[],
  state: ReturnType<typeof buildOverlayState>,
  title: string,
): IndexedNote[] {
  const folded = foldMatchKey(title.trim());
  const merged = new Map<string, IndexedNote>();
  for (const note of base) {
    merged.set(note.path, note);
  }
  for (const note of state.byTitleFold.get(folded) ?? []) {
    merged.set(note.path, note);
  }
  return [...merged.values()].sort((left, right) => comparePath(left.path, right.path));
}

function mergeAliasPaths(
  base: string[],
  state: ReturnType<typeof buildOverlayState>,
  alias: string,
): string[] {
  const folded = foldMatchKey(alias.trim());
  const merged = new Set<string>(base);
  for (const notePath of state.byAliasFold.get(folded) ?? []) {
    merged.add(notePath);
  }
  return [...merged].sort((left, right) => comparePath(left, right));
}

function pushMap<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const list = map.get(key) ?? [];
  list.push(value);
  map.set(key, list);
}
