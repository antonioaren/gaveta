import { copyFile, mkdir, unlink } from 'node:fs/promises';
import path from 'node:path';
import { expect, it } from 'vitest';
import { VaultIndexSession } from './vault-index.ts';
import { withVaultCopy } from './test-helpers.ts';

it('emits note:changed when add applies to an already-indexed path', async () => {
  await withVaultCopy(async (vaultRoot) => {
    const session = new VaultIndexSession(vaultRoot);
    const recentUnlinks = new Map<string, import('./vault-move.ts').RecentUnlink>();
    const recentAdds = new Map<string, import('./vault-move.ts').RecentUnlink>();
    const event = await session.applyFileChange(
      { kind: 'add', relativePath: 'destino-enlace.html' },
      recentUnlinks,
      recentAdds,
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
    const recentAdds = new Map<string, import('./vault-move.ts').RecentUnlink>();
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
      recentAdds,
      pairWindowMs,
    );
    const unlinkEvent = await session.applyFileChange(
      { kind: 'unlink', relativePath: fromPath },
      recentUnlinks,
      recentAdds,
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
      recentAdds,
      pairWindowMs,
    );
    expect(moved?.type).toBe('note:moved');
    if (moved?.type === 'note:moved') {
      expect(moved.from).toBe(fromPath);
    }
    session.close();
  });
});

it('pairs a delayed unlink with an earlier add when the move window allows it', async () => {
  await withVaultCopy(async (vaultRoot) => {
    const session = new VaultIndexSession(vaultRoot);
    const recentUnlinks = new Map<string, import('./vault-move.ts').RecentUnlink>();
    const recentAdds = new Map<string, import('./vault-move.ts').RecentUnlink>();
    const pairWindowMs = 3_000;
    const fromPath = 'folder-a/destino-enlace.html';
    const toPath = 'folder-b/destino-enlace.html';

    await mkdir(path.join(vaultRoot, 'folder-a'), { recursive: true });
    await mkdir(path.join(vaultRoot, 'folder-b'), { recursive: true });
    await copyFile(path.join(vaultRoot, 'destino-enlace.html'), path.join(vaultRoot, fromPath));

    await session.applyFileChange(
      { kind: 'add', relativePath: fromPath },
      recentUnlinks,
      recentAdds,
      pairWindowMs,
    );
    await copyFile(path.join(vaultRoot, 'destino-enlace.html'), path.join(vaultRoot, toPath));
    const added = await session.applyFileChange(
      { kind: 'add', relativePath: toPath },
      recentUnlinks,
      recentAdds,
      pairWindowMs,
    );
    expect(added?.type).toBe('note:added');

    const moved = await session.applyFileChange(
      { kind: 'unlink', relativePath: fromPath },
      recentUnlinks,
      recentAdds,
      pairWindowMs,
    );
    expect(moved?.type).toBe('note:moved');
    if (moved?.type === 'note:moved') {
      expect(moved.from).toBe(fromPath);
      expect(moved.path).toBe(toPath);
    }

    session.close();
  });
});

it('pairs unlink with an on-disk destination that shares basename and id', async () => {
  await withVaultCopy(async (vaultRoot) => {
    const session = new VaultIndexSession(vaultRoot);
    const recentUnlinks = new Map<string, import('./vault-move.ts').RecentUnlink>();
    const recentAdds = new Map<string, import('./vault-move.ts').RecentUnlink>();
    const fromPath = 'folder-a/destino.html';
    const toPath = 'folder-b/destino.html';

    await mkdir(path.join(vaultRoot, 'folder-a'), { recursive: true });
    await mkdir(path.join(vaultRoot, 'folder-b'), { recursive: true });
    await copyFile(path.join(vaultRoot, 'destino-enlace.html'), path.join(vaultRoot, fromPath));
    await session.applyFileChange(
      { kind: 'add', relativePath: fromPath },
      recentUnlinks,
      recentAdds,
      3_000,
    );
    await copyFile(path.join(vaultRoot, 'destino-enlace.html'), path.join(vaultRoot, toPath));
    await unlink(path.join(vaultRoot, fromPath));
    const moved = await session.applyFileChange(
      { kind: 'unlink', relativePath: fromPath },
      recentUnlinks,
      recentAdds,
      3_000,
    );
    expect(moved?.type).toBe('note:moved');
    if (moved?.type === 'note:moved') {
      expect(moved.from).toBe(fromPath);
      expect(moved.path).toBe(toPath);
    }
    session.close();
  });
});

it('emits note:moved on change when the index still has the old path for the same id', async () => {
  await withVaultCopy(async (vaultRoot) => {
    const session = new VaultIndexSession(vaultRoot);
    const recentUnlinks = new Map<string, import('./vault-move.ts').RecentUnlink>();
    const recentAdds = new Map<string, import('./vault-move.ts').RecentUnlink>();
    const fromPath = 'folder-a/destino-enlace.html';
    const toPath = 'folder-b/destino-enlace.html';

    await mkdir(path.join(vaultRoot, 'folder-a'), { recursive: true });
    await mkdir(path.join(vaultRoot, 'folder-b'), { recursive: true });
    await copyFile(path.join(vaultRoot, 'destino-enlace.html'), path.join(vaultRoot, fromPath));
    await session.applyFileChange(
      { kind: 'add', relativePath: fromPath },
      recentUnlinks,
      recentAdds,
      3_000,
    );
    await copyFile(path.join(vaultRoot, 'destino-enlace.html'), path.join(vaultRoot, toPath));
    await unlink(path.join(vaultRoot, fromPath));
    const moved = await session.applyFileChange(
      { kind: 'change', relativePath: toPath },
      recentUnlinks,
      recentAdds,
      3_000,
    );
    expect(moved?.type).toBe('note:moved');
    if (moved?.type === 'note:moved') {
      expect(moved.from).toBe(fromPath);
      expect(moved.path).toBe(toPath);
    }
    session.close();
  });
});
