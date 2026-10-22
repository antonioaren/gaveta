import { randomBytes } from 'node:crypto';
import { constants } from 'node:fs';
import { open, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { nodeErrorCode } from './node-error.ts';

const directorySyncIgnored = new Set(['EINVAL', 'EPERM', 'ENOTSUP', 'EBADF', 'EISDIR']);

/**
 * Replace `destination` by writing a temp file in the same directory, fsyncing
 * it, then renaming. Callers must already have checked that the path is inside
 * the vault. A crash before the rename leaves the previous file intact.
 */
export async function writeAtomic(destination: string, contents: string): Promise<void> {
  const directory = path.dirname(destination);
  const temporary = path.join(
    directory,
    `.${path.basename(destination)}.${randomBytes(8).toString('hex')}.tmp`,
  );
  const handle = await open(
    temporary,
    constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
    0o644,
  );
  try {
    await handle.writeFile(contents, 'utf8');
    await handle.sync();
  } catch (error) {
    await handle.close();
    await rm(temporary, { force: true });
    throw error;
  }
  await handle.close();
  try {
    await rename(temporary, destination);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
  await syncDirectory(directory);
}

async function syncDirectory(directory: string): Promise<void> {
  let handle;
  try {
    handle = await open(directory, constants.O_RDONLY);
  } catch (error) {
    if (isIgnorableDirectorySync(error)) {
      return;
    }
    throw error;
  }
  try {
    await handle.sync();
  } catch (error) {
    if (!isIgnorableDirectorySync(error)) {
      throw error;
    }
  } finally {
    await handle.close();
  }
}

function isIgnorableDirectorySync(error: unknown): boolean {
  const code = nodeErrorCode(error);
  return code !== undefined && directorySyncIgnored.has(code);
}
