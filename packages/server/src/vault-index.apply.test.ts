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
