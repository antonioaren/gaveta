import { mkdir, readFile, readdir, realpath, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { readWorkspaceVersion } from '../workspace-version.ts';
import {
  createDefaultVaultConfig,
  parseVaultConfig,
  readVaultConfig,
  writeVaultConfig,
} from './config.ts';
import { withTemp } from './fixture.ts';
import { bundledVaultAssetHashes } from './assets.ts';
import { initVault } from './init.ts';
import { DEFAULT_MERMAID_BOOT_JS, DEFAULT_MERMAID_MIN_JS } from '../mermaid/assets.ts';
import { DEFAULT_THEME_CSS } from '../theme/theme.ts';
import { INDEX_SCHEMA_VERSION, openVaultIndex } from '../sqlite/store.ts';
import { AGENT_BLOCK_END, AGENT_BLOCK_START } from './agent-block.ts';

function countOf(text: string, needle: string): number {
  let count = 0;
  let from = 0;
  while (from < text.length) {
    const at = text.indexOf(needle, from);
    if (at === -1) {
      return count;
    }
    count += 1;
    from = at + needle.length;
  }
  return count;
}

it('creates config, theme, and an empty index without touching existing html', async () => {
  await withTemp(async (parent) => {
    const root = join(parent, 'vault');
    const html = '<html><script>alert(1)</script><p>Hola</p></html>';
    await mkdir(join(root, 'notes'), { recursive: true });
    await writeFile(join(root, 'keep.html'), html);
    await writeFile(join(root, 'notes', 'nested.html'), html);

    const created = await initVault({ cwd: root });
    expect(created.root).toBe(await realpath(root));
    expect(created.created).toEqual([
      '.gaveta/config.json',
      '.gaveta/theme.css',
      '.gaveta/mermaid.min.js',
      '.gaveta/mermaid-boot.js',
      '.gaveta/MERMAID-LICENSE.txt',
      '.gaveta/index.sqlite',
    ]);
    expect(created.preserved).toEqual([]);
    expect(created.agentInstructions).toEqual([]);
    expect(
      parseVaultConfig(JSON.parse(await readFile(join(root, '.gaveta/config.json'), 'utf8'))),
    ).toEqual({
      ...createDefaultVaultConfig(readWorkspaceVersion()),
      assetsVersion: readWorkspaceVersion(),
      assets: bundledVaultAssetHashes(),
    });
    expect(await readFile(join(root, '.gaveta/theme.css'), 'utf8')).toBe(DEFAULT_THEME_CSS);
    expect(await readFile(join(root, '.gaveta/mermaid.min.js'), 'utf8')).toBe(
      DEFAULT_MERMAID_MIN_JS,
    );
    expect(await readFile(join(root, '.gaveta/mermaid-boot.js'), 'utf8')).toBe(
      DEFAULT_MERMAID_BOOT_JS,
    );
    expect(await readFile(join(root, 'keep.html'), 'utf8')).toBe(html);
    expect(await readFile(join(root, 'notes/nested.html'), 'utf8')).toBe(html);

    const index = await openVaultIndex(root);
    try {
      expect(index.schemaVersion).toBe(INDEX_SCHEMA_VERSION);
      expect(index.notes()).toEqual([]);
    } finally {
      index.close();
    }

    const configBytes = await readFile(join(root, '.gaveta/config.json'));
    const themeBytes = await readFile(join(root, '.gaveta/theme.css'));
    const indexBytes = await readFile(join(root, '.gaveta/index.sqlite'));
    const again = await initVault({ cwd: root });
    expect(again.created).toEqual([]);
    expect(again.preserved).toEqual([
      '.gaveta/config.json',
      '.gaveta/theme.css',
      '.gaveta/mermaid.min.js',
      '.gaveta/mermaid-boot.js',
      '.gaveta/MERMAID-LICENSE.txt',
      '.gaveta/index.sqlite',
    ]);
    expect(await readFile(join(root, '.gaveta/config.json'))).toEqual(configBytes);
    expect(await readFile(join(root, '.gaveta/theme.css'))).toEqual(themeBytes);
    expect(await readFile(join(root, '.gaveta/index.sqlite'))).toEqual(indexBytes);
    expect(await readFile(join(root, 'keep.html'), 'utf8')).toBe(html);
  });
});

it('fills only the vault files that are missing and keeps a custom config', async () => {
  await withTemp(async (parent) => {
    const root = join(parent, 'vault');
    await mkdir(join(root, '.gaveta'), { recursive: true });
    const custom = {
      rel: { strict: true, vocabulary: ['related'] },
      remoteAllowlist: ['cdn.example'],
    };
    await writeVaultConfig(root, custom);
    const before = await readFile(join(root, '.gaveta/config.json'));

    const result = await initVault({ cwd: root });
    expect(result.created).toEqual([
      '.gaveta/theme.css',
      '.gaveta/mermaid.min.js',
      '.gaveta/mermaid-boot.js',
      '.gaveta/MERMAID-LICENSE.txt',
      '.gaveta/index.sqlite',
    ]);
    expect(result.preserved).toEqual(['.gaveta/config.json']);
    const after = await readVaultConfig(root);
    expect(after.rel).toEqual(custom.rel);
    expect(after.remoteAllowlist).toEqual(custom.remoteAllowlist);
    expect(after.assetsVersion).toBe(readWorkspaceVersion());
    expect(after.assets).toEqual(bundledVaultAssetHashes());
    expect(await readFile(join(root, '.gaveta/config.json'))).not.toEqual(before);
    expect(await readFile(join(root, '.gaveta/theme.css'), 'utf8')).toBe(DEFAULT_THEME_CSS);
  });
});

it('leaves an existing index byte-for-byte, even when it is not a database', async () => {
  await withTemp(async (parent) => {
    const root = join(parent, 'vault');
    await mkdir(join(root, '.gaveta'), { recursive: true });
    await writeFile(join(root, '.gaveta/config.json'), '{"no":true}\n');
    await writeFile(join(root, '.gaveta/theme.css'), 'custom-theme');
    await writeFile(join(root, '.gaveta/index.sqlite'), 'not-a-database');

    const result = await initVault({ cwd: root });
    expect(result.created).toEqual([
      '.gaveta/mermaid.min.js',
      '.gaveta/mermaid-boot.js',
      '.gaveta/MERMAID-LICENSE.txt',
    ]);
    expect(result.preserved).toEqual([
      '.gaveta/config.json',
      '.gaveta/theme.css',
      '.gaveta/index.sqlite',
    ]);
    expect(await readFile(join(root, '.gaveta/index.sqlite'), 'utf8')).toBe('not-a-database');
    expect(await readFile(join(root, '.gaveta/theme.css'), 'utf8')).toBe('custom-theme');
    expect(await readFile(join(root, '.gaveta/config.json'), 'utf8')).toBe('{"no":true}\n');
  });
});

it('creates the target directory and writes agent instructions only inside it', async () => {
  await withTemp(async (parent) => {
    const result = await initVault({
      cwd: parent,
      directory: 'nuevo/vault',
      agentInstructions: 'agents',
    });
    const root = join(parent, 'nuevo', 'vault');
    expect(result.root).toBe(await realpath(root));
    expect(result.agentInstructions).toEqual([
      { target: 'agents', path: 'AGENTS.md', changed: true },
    ]);
    const text = await readFile(join(root, 'AGENTS.md'), 'utf8');
    expect(countOf(text, AGENT_BLOCK_START)).toBe(1);
    expect(countOf(text, AGENT_BLOCK_END)).toBe(1);
    expect(text).toContain('gaveta guide');
    await expect(readFile(join(parent, 'AGENTS.md'), 'utf8')).rejects.toThrow();
    await expect(readFile(join(parent, 'CLAUDE.md'), 'utf8')).rejects.toThrow();

    const bytes = await readFile(join(root, 'AGENTS.md'));
    const again = await initVault({
      cwd: parent,
      directory: 'nuevo/vault',
      agentInstructions: 'agents',
    });
    expect(again.agentInstructions).toEqual([
      { target: 'agents', path: 'AGENTS.md', changed: false },
    ]);
    expect(await readFile(join(root, 'AGENTS.md'))).toEqual(bytes);
    expect(countOf(await readFile(join(root, 'AGENTS.md'), 'utf8'), AGENT_BLOCK_START)).toBe(1);
  });
});

it('updates a delimited block in CLAUDE.md without dropping the rest of the file', async () => {
  await withTemp(async (parent) => {
    const root = join(parent, 'vault');
    await mkdir(root);
    const existing = [
      '# Proyecto',
      '',
      '<!-- gaveta:start -->',
      'instrucciones viejas',
      '<!-- gaveta:end -->',
      '',
      'Pie.',
      '',
    ].join('\n');
    await writeFile(join(root, 'CLAUDE.md'), existing);

    await initVault({ cwd: root, agentInstructions: 'claude' });
    const text = await readFile(join(root, 'CLAUDE.md'), 'utf8');
    expect(countOf(text, AGENT_BLOCK_START)).toBe(1);
    expect(text).toContain('# Proyecto');
    expect(text).toContain('Pie.');
    expect(text).not.toContain('instrucciones viejas');
    expect(text).toContain('gaveta guide');
    await expect(readFile(join(root, 'AGENTS.md'), 'utf8')).rejects.toThrow();

    const bytes = await readFile(join(root, 'CLAUDE.md'));
    await initVault({ cwd: root, agentInstructions: 'claude' });
    expect(await readFile(join(root, 'CLAUDE.md'))).toEqual(bytes);
  });
});

it('does not create instruction files unless asked', async () => {
  await withTemp(async (parent) => {
    const root = join(parent, 'vault');
    await mkdir(root);
    await initVault({ cwd: root });
    const entries = await readdir(root);
    expect(entries).toEqual(['.gaveta']);
  });
});

it('rejects unknown agent instruction targets', async () => {
  await withTemp(async (parent) => {
    const root = join(parent, 'vault');
    await mkdir(root);
    await expect(initVault({ cwd: root, agentInstructions: '' })).rejects.toMatchObject({
      code: 'E_ARG_INVALID',
    });
    expect(await readdir(root)).toEqual([]);
  });
});

it('writes all agent instruction files when asked for all', async () => {
  await withTemp(async (parent) => {
    const root = join(parent, 'vault');
    await mkdir(root);
    const result = await initVault({ cwd: root, agentInstructions: 'all' });
    expect(result.agentInstructions.map((entry) => entry.path).sort()).toEqual([
      '.cursor/rules/gaveta.mdc',
      '.github/copilot-instructions.md',
      'AGENTS.md',
      'CLAUDE.md',
    ]);
  });
});
