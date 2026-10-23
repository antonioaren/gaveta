import { parseNote, readVaultText } from '@gaveta/core';
import path from 'node:path';

export async function readNoteUlidFromVaultFile(
  vaultRoot: string,
  relativePath: string,
): Promise<string | null> {
  try {
    const html = await readVaultText(vaultRoot, relativePath);
    const parsed = parseNote(html);
    const id = parsed.note?.id;
    return typeof id === 'string' && id.length > 0 ? id : null;
  } catch {
    return null;
  }
}

export function vaultNoteAbsolutePath(vaultRoot: string, relativePath: string): string {
  return path.join(vaultRoot, relativePath);
}
