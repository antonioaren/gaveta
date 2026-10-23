import type { VaultIndexSession } from './vault-index.ts';
import { readNoteUlidFromVaultFile } from './vault-note-id.ts';

export type PendingFileChange =
  | { readonly kind: 'change' | 'add' | 'unlink'; readonly relativePath: string }
  | { readonly kind: 'moved'; readonly from: string; readonly to: string };

export function coalescePendingChanges(
  batch: readonly { readonly kind: 'change' | 'add' | 'unlink'; readonly relativePath: string }[],
): PendingFileChange[] {
  const byPath = new Map<
    string,
    { readonly kind: 'change' | 'add' | 'unlink'; readonly relativePath: string }
  >();
  for (const item of batch) {
    byPath.set(item.relativePath, item);
  }
  return [...byPath.values()];
}

export function sortPendingChanges(batch: readonly PendingFileChange[]): PendingFileChange[] {
  const rank = (change: PendingFileChange): number => {
    if (change.kind === 'unlink') {
      return 0;
    }
    if (change.kind === 'moved' || change.kind === 'add') {
      return 1;
    }
    return 2;
  };
  return [...batch].sort((left, right) => rank(left) - rank(right));
}

export async function coalesceMovesByNoteId(
  batch: readonly PendingFileChange[],
  vaultRoot: string,
  session: VaultIndexSession,
): Promise<PendingFileChange[]> {
  const unlinks: { readonly kind: 'unlink'; readonly relativePath: string }[] = [];
  const adds: { readonly kind: 'add'; readonly relativePath: string }[] = [];
  const rest: PendingFileChange[] = [];
  for (const item of batch) {
    if (item.kind === 'unlink') {
      unlinks.push({ kind: 'unlink', relativePath: item.relativePath });
      continue;
    }
    if (item.kind === 'add') {
      adds.push({ kind: 'add', relativePath: item.relativePath });
      continue;
    }
    if (item.kind === 'change') {
      rest.push(item);
    }
  }

  const unlinkIds = new Map<string, string | null>();
  for (const unlink of unlinks) {
    unlinkIds.set(unlink.relativePath, await session.peekNoteId(unlink.relativePath));
  }

  const usedUnlinks = new Set<string>();
  const out: PendingFileChange[] = [...rest];

  if (unlinks.length === 1 && adds.length === 1) {
    const unlink = unlinks[0];
    const add = adds[0];
    if (unlink !== undefined && add !== undefined) {
      const addId = await readNoteUlidFromVaultFile(vaultRoot, add.relativePath);
      const unlinkId = unlinkIds.get(unlink.relativePath) ?? null;
      if (addId !== null && (unlinkId === addId || unlinkId === null)) {
        usedUnlinks.add(unlink.relativePath);
        out.push({ kind: 'moved', from: unlink.relativePath, to: add.relativePath });
        return sortPendingChanges(out);
      }
    }
  }
  for (const add of adds) {
    const addId = await readNoteUlidFromVaultFile(vaultRoot, add.relativePath);
    let partner: string | undefined;
    if (addId !== null) {
      for (const [unlinkPath, unlinkId] of unlinkIds) {
        if (!usedUnlinks.has(unlinkPath) && unlinkId === addId) {
          partner = unlinkPath;
          break;
        }
      }
    }
    if (partner !== undefined) {
      usedUnlinks.add(partner);
      out.push({ kind: 'moved', from: partner, to: add.relativePath });
    } else {
      out.push(add);
    }
  }
  for (const unlink of unlinks) {
    if (!usedUnlinks.has(unlink.relativePath)) {
      out.push(unlink);
    }
  }
  return sortPendingChanges(out);
}
