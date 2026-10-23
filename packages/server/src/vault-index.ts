import { openVaultIndex, type VaultIndex } from '@gaveta/core';
import { warningFromCode, type ApiWarning } from './envelope.ts';

export class VaultIndexSession {
  private index: VaultIndex | null = null;
  private readonly vaultRoot: string;

  constructor(vaultRoot: string) {
    this.vaultRoot = vaultRoot;
  }

  async withIndex<T>(
    run: (index: VaultIndex) => Promise<T>,
  ): Promise<{ result: T; warnings: ApiWarning[] }> {
    const index = await this.open();
    const warnings = await ensureIndexed(index);
    const result = await run(index);
    return { result, warnings };
  }

  close(): void {
    if (this.index !== null) {
      this.index.close();
      this.index = null;
    }
  }

  private async open(): Promise<VaultIndex> {
    this.index ??= await openVaultIndex(this.vaultRoot);
    return this.index;
  }
}

async function ensureIndexed(index: VaultIndex): Promise<ApiWarning[]> {
  const recovered = index.recovery();
  if (recovered !== null || index.notes().length === 0) {
    await index.rebuild();
  }
  if (recovered === null) {
    return [];
  }
  return [warningFromCode('W_INDEX_RECOVERED')];
}
