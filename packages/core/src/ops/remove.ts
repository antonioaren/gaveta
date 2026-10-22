import { GavetaError } from '../errors.ts';
import { resolveRef } from '../links/ref.ts';
import type { VaultIndex } from '../sqlite/store.ts';
import { readVaultText } from '../vault/paths.ts';
import { commitNoteChanges, type Change } from './commit.ts';
import { GavetaOperationError } from './error.ts';
import { convertToPending } from './edit.ts';
import { incomingLinks } from './incoming.ts';
import { rootOf } from './move.ts';
import type { RemoveNoteResult } from './types.ts';

/**
 * Delete a note. Incoming canonical links block the delete unless `force` is
 * true, in which case those links become pending instead of broken.
 */
export async function removeNote(
  index: VaultIndex,
  ref: string,
  options?: unknown,
): Promise<RemoveNoteResult> {
  const force = readForce(options);
  const root = rootOf(index);
  const resolved = resolveRef(index, ref);
  const note = index.note(resolved.path);
  if (note === null) {
    throw new GavetaError('E_REF_NOT_FOUND');
  }
  const incoming = incomingLinks(index, note.path);
  if (incoming.notes.length > 0 && !force) {
    throw new GavetaOperationError('E_HAS_BACKLINKS', {}, { affected: incoming.notes });
  }

  const changes: Change[] = [];
  const pending: string[] = [];
  if (force && note.id !== null) {
    for (const source of incoming.notes) {
      if (source.path === note.path) {
        continue;
      }
      const html = await readVaultText(root, source.path);
      const edited = convertToPending(html, note.id, note.title);
      const expected = incoming.counts.get(source.path) ?? 0;
      if (edited.anchors < expected) {
        throw new GavetaError('E_HTML_INVALID');
      }
      if (edited.html === html) {
        continue;
      }
      changes.push({ path: source.path, before: html, after: edited.html });
      pending.push(source.path);
    }
  }

  const original = await readVaultText(root, note.path);
  changes.push({ path: note.path, before: original, after: null });
  await commitNoteChanges(index, root, changes, async () => {
    for (const sourcePath of pending) {
      await index.upsert(sourcePath);
    }
    await index.remove(note.path);
  });

  return {
    id: note.id,
    path: note.path,
    title: note.title,
    forced: force,
    pending,
  };
}

function readForce(options: unknown): boolean {
  if (options === undefined) {
    return false;
  }
  if (options === null || typeof options !== 'object' || Array.isArray(options)) {
    throw new GavetaError('E_ARG_INVALID');
  }
  const record = options as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (key !== 'force') {
      throw new GavetaError('E_ARG_INVALID');
    }
  }
  if (!Object.hasOwn(record, 'force')) {
    return false;
  }
  const force = record.force;
  if (force === undefined) {
    return false;
  }
  if (typeof force !== 'boolean') {
    throw new GavetaError('E_ARG_INVALID');
  }
  return force;
}
