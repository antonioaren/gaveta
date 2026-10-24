import { splitNotePath } from '../explorer/build-tree.ts';
import { allocateSlug, slugify } from '../notes/slugify.ts';

function basenameWithoutHtml(path: string): string {
  const { file } = splitNotePath(path);
  return file.toLowerCase().endsWith('.html') ? file.slice(0, -'.html'.length) : file;
}

function slugsTakenInFolder(
  folder: string,
  existingPaths: readonly string[],
  excludePath: string,
): Set<string> {
  const taken = new Set<string>();
  for (const path of existingPaths) {
    if (path === excludePath) {
      continue;
    }
    const { folder: noteFolder } = splitNotePath(path);
    if (noteFolder !== folder) {
      continue;
    }
    taken.add(basenameWithoutHtml(path));
  }
  return taken;
}

/** Vault-relative path for a rename from `currentPath` using the new title. */
export function renameDestinationPath(
  currentPath: string,
  newTitle: string,
  existingPaths: readonly string[],
): string | null {
  const trimmed = newTitle.trim();
  if (trimmed.length === 0) {
    return null;
  }
  const base = slugify(trimmed);
  if (base.length === 0) {
    return null;
  }
  const { folder } = splitNotePath(currentPath);
  const taken = slugsTakenInFolder(folder, existingPaths, currentPath);
  const slug = allocateSlug(base, taken);
  const file = `${slug}.html`;
  return folder.length === 0 ? file : `${folder}/${file}`;
}

/** Vault-relative path when moving a note into `folder` (trailing folder path). */
export function moveDestinationPath(notePath: string, folder: string): string {
  const normalizedFolder = folder.trim().replace(/\/+$/u, '');
  const { file } = splitNotePath(notePath);
  if (normalizedFolder.length === 0) {
    return file;
  }
  return `${normalizedFolder}/${file}`;
}
