import { copyFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { expect, it } from 'vitest';
import { VaultIndexSession } from './vault-index.ts';
import { withVaultCopy } from './test-helpers.ts';

it('emits note:changed when add applies to an already-indexed path', async () => {
  await withVaultCopy(async (vaultRoot) => {
    const session = new VaultIndexSession(vaultRoot);
    const recentUnlinks = new Map<string, import('./vault-move.ts').RecentUnlink>();
    const event = await session.applyFileChange(
      { kind: 'add', relativePath: 'destino-enlace.html' },
      recentUnlinks,
      200,
    );
    expect(event?.type).toBe('note:changed');
    session.close();
  });
});

it('pairs a delayed add with an earlier unlink when the move window allows it', async () => {
  await withVaultCopy(async (vaultRoot) => {
    const session = new VaultIndexSession(vaultRoot);
    const recentUnlinks = new Map<string, import('./vault-move.ts').RecentUnlink>();
    const pairWindowMs = 3_000;
    const gapMs = 600;
    const fromPath = 'folder-a/destino-enlace.html';
    const toPath = 'folder-b/destino-enlace.html';

    await mkdir(path.join(vaultRoot, 'folder-a'), { recursive: true });
    await mkdir(path.join(vaultRoot, 'folder-b'), { recursive: true });
    await copyFile(path.join(vaultRoot, 'destino-enlace.html'), path.join(vaultRoot, fromPath));

    await session.applyFileChange(
      { kind: 'add', relativePath: fromPath },
      recentUnlinks,
      pairWindowMs,
    );
    const unlinkEvent = await session.applyFileChange(
      { kind: 'unlink', relativePath: fromPath },
      recentUnlinks,
      pairWindowMs,
    );
    expect(unlinkEvent?.type).toBe('note:removed');

    const unlinkMeta = recentUnlinks.get(fromPath);
    expect(unlinkMeta).toBeDefined();
    if (unlinkMeta !== undefined) {
      recentUnlinks.set(fromPath, {
        id: unlinkMeta.id,
        at: Date.now() - gapMs,
      });
    }

    await copyFile(path.join(vaultRoot, 'destino-enlace.html'), path.join(vaultRoot, toPath));
    const moved = await session.applyFileChange(
      { kind: 'add', relativePath: toPath },
      recentUnlinks,
      pairWindowMs,
    );
    expect(moved?.type).toBe('note:moved');
    if (moved?.type === 'note:moved') {
      expect(moved.from).toBe(fromPath);
    }
    session.close();
  });
});
