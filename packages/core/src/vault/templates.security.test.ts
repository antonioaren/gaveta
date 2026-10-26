import { mkdir, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createDefaultVaultConfig, writeVaultConfig } from '../index.ts';
import { withTemp } from './fixture.ts';
import { GAVETA_DIRECTORY } from './constants.ts';
import { readNoteTemplateBody } from './templates.ts';

async function makeVault(parent: string): Promise<string> {
  const root = join(parent, 'vault');
  await mkdir(join(root, GAVETA_DIRECTORY), { recursive: true });
  await writeVaultConfig(root, createDefaultVaultConfig());
  return root;
}

describe('note template path safety', () => {
  it('rejects a symlinked template file', async () => {
    await withTemp(async (parent) => {
      const root = await makeVault(parent);
      const outside = join(parent, 'outside.html');
      const templatesDir = join(root, GAVETA_DIRECTORY, 'templates');
      await mkdir(templatesDir, { recursive: true });
      await symlink(outside, join(templatesDir, 'doc.html'));
      await expect(readNoteTemplateBody(root, 'doc')).rejects.toMatchObject({
        code: 'E_PATH_OUTSIDE_VAULT',
      });
    });
  });
});
