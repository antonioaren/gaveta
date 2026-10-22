import path from 'node:path';
import { GavetaError } from '../errors.ts';
import { resolveRef } from '../links/ref.ts';
import type { VaultIndex } from '../sqlite/store.ts';
import { readVaultText } from '../vault/paths.ts';
import { commitNoteChanges, type Change } from './commit.ts';
import { resolveDestination } from './destination.ts';
import { retargetIncoming, retargetMoved } from './edit.ts';
import { incomingLinks } from './incoming.ts';
import type { MoveNoteResult } from './types.ts';

/**
 * Move or rename a note and rewrite every incoming href in one operation.
 * The moved note's theme href and its own relative links are recalculated.
 * A failed write restores every file this call changed.
 */
export async function moveNote(
  index: VaultIndex,
  ref: string,
  destination: string,
): Promise<MoveNoteResult> {
  const root = rootOf(index);
  const resolved = resolveRef(index, ref);
  const note = index.note(resolved.path);
  if (note === null) {
    throw new GavetaError('E_REF_NOT_FOUND');
  }
  if (note.id !== null && index.notesById(note.id).length > 1) {
    throw new GavetaError('E_ID_DUPLICATE');
  }
  const to = await resolveDestination(root, note.path, destination);
  if (to === note.path) {
    return { id: note.id, from: note.path, to, rewritten: [] };
  }

  const incoming = incomingLinks(index, note.path);
  const sourceHtml = await readVaultText(root, note.path);
  const changes: Change[] = [];
  const rewritten: string[] = [];

  for (const source of incoming.notes) {
    if (source.path === note.path || note.id === null) {
      continue;
    }
    const html = await readVaultText(root, source.path);
    const edited = retargetIncoming(html, source.path, note.id, to);
    const expected = incoming.counts.get(source.path) ?? 0;
    if (edited.anchors < expected) {
      throw new GavetaError('E_HTML_INVALID');
    }
    if (edited.html === html) {
      continue;
    }
    changes.push({ path: source.path, before: html, after: edited.html });
    rewritten.push(source.path);
  }

  const moved = retargetMoved(sourceHtml, note.path, to, note.id, index);
  const selfCount = incoming.counts.get(note.path) ?? 0;
  if (moved.anchors < selfCount) {
    throw new GavetaError('E_HTML_INVALID');
  }
  changes.push({ path: to, before: null, after: moved.html });
  changes.push({ path: note.path, before: sourceHtml, after: null });

  await commitNoteChanges(index, root, changes, async () => {
    await index.remove(note.path);
    await index.upsert(to);
    for (const sourcePath of rewritten) {
      await index.upsert(sourcePath);
    }
  });

  return { id: note.id, from: note.path, to, rewritten };
}

export function rootOf(index: VaultIndex): string {
  return path.dirname(path.dirname(index.location));
}
