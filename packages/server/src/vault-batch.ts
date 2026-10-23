import path from 'node:path';

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
  const unlinks = new Map<string, { readonly kind: 'unlink'; readonly relativePath: string }>();
  const adds: { readonly kind: 'add'; readonly relativePath: string }[] = [];
  const rest: PendingFileChange[] = [];
  for (const item of byPath.values()) {
    if (item.kind === 'unlink') {
      unlinks.set(item.relativePath, { kind: 'unlink', relativePath: item.relativePath });
      continue;
    }
    if (item.kind === 'add') {
      adds.push({ kind: 'add', relativePath: item.relativePath });
      continue;
    }
    rest.push(item);
  }
  const out: PendingFileChange[] = [...rest];
  for (const add of adds) {
    const directory = path.dirname(add.relativePath);
    let partner: string | undefined;
    for (const unlinkPath of unlinks.keys()) {
      if (path.dirname(unlinkPath) === directory) {
        partner = unlinkPath;
        break;
      }
    }
    if (partner !== undefined) {
      unlinks.delete(partner);
      out.push({ kind: 'moved', from: partner, to: add.relativePath });
    } else {
      out.push(add);
    }
  }
  for (const unlink of unlinks.values()) {
    out.push(unlink);
  }
  return out;
}
