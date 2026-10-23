import type { NoteListItem } from '../api/types.ts';

export interface FolderNode {
  readonly name: string;
  readonly path: string;
  readonly children: FolderNode[];
  readonly notes: NoteListItem[];
}

export function splitNotePath(path: string): { folder: string; file: string } {
  const normalized = path.replace(/\\/gu, '/');
  const slash = normalized.lastIndexOf('/');
  if (slash === -1) {
    return { folder: '', file: normalized };
  }
  return {
    folder: normalized.slice(0, slash),
    file: normalized.slice(slash + 1),
  };
}

export function buildFolderTree(notes: readonly NoteListItem[]): FolderNode {
  const root: FolderNode = { name: '', path: '', children: [], notes: [] };
  const byPath = new Map<string, FolderNode>([['', root]]);

  for (const note of notes) {
    const { folder } = splitNotePath(note.path);
    const segments = folder.length === 0 ? [] : folder.split('/');
    let current = root;
    let built = '';
    for (const segment of segments) {
      built = built.length === 0 ? segment : `${built}/${segment}`;
      let child = current.children.find((node) => node.name === segment);
      if (child === undefined) {
        child = { name: segment, path: built, children: [], notes: [] };
        current.children.push(child);
        byPath.set(built, child);
      }
      current = child;
    }
    current.notes.push(note);
  }

  const sortTree = (node: FolderNode): void => {
    node.children.sort((a, b) => a.name.localeCompare(b.name, 'es'));
    node.notes.sort((a, b) => a.title.localeCompare(b.title, 'es'));
    for (const child of node.children) {
      sortTree(child);
    }
  };
  sortTree(root);
  return root;
}

export function collectTags(notes: readonly NoteListItem[]): string[] {
  const tags = new Set<string>();
  for (const note of notes) {
    for (const tag of note.tags) {
      tags.add(tag);
    }
  }
  return [...tags].sort((a, b) => a.localeCompare(b, 'es'));
}

export function collectTypes(notes: readonly NoteListItem[]): NoteListItem['type'][] {
  const types = new Set<NoteListItem['type']>();
  for (const note of notes) {
    types.add(note.type);
  }
  return [...types].filter((value) => value !== null);
}
