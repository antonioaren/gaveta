import { lstat, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { exportVaultToMarkdown, resolveInsideExport } from './export.ts';
import { initVault } from './vault/init.ts';
import { openVaultIndex } from './sqlite/store.ts';
import { writeVaultText } from './vault/paths.ts';

const NOTE_ID = '01JBP7EXPORTSEC0000000000001';
const CREATED = '2026-10-22T10:00:00Z';

function noteHtml(title: string, body: string): string {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${title}</title>
<meta name="gaveta:id" content="${NOTE_ID}">
<meta name="gaveta:type" content="doc">
<meta name="gaveta:created" content="${CREATED}">
<meta name="gaveta:updated" content="${CREATED}">
</head><body><article><h1>${title}</h1>${body}</article></body></html>`;
}

async function withVault(run: (vault: string, parent: string) => Promise<void>): Promise<void> {
  const parent = await mkdtemp(join(tmpdir(), 'gaveta-export-sec-'));
  const vault = join(parent, 'vault');
  try {
    await initVault({ cwd: parent, directory: 'vault' });
    const index = await openVaultIndex(vault);
    try {
      await index.rebuild();
    } finally {
      index.close();
    }
    await run(vault, parent);
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
}

it('rejects output paths inside the vault or via symlinks', async () => {
  await withVault(async (vault, parent) => {
    await writeVaultText(vault, 'nota.html', noteHtml('Nota', '<p>Hola</p>'));
    const index = await openVaultIndex(vault);
    try {
      await index.rebuild();
    } finally {
      index.close();
    }
    await expect(
      exportVaultToMarkdown({
        vaultRoot: vault,
        cwd: vault,
        ref: 'nota.html',
        outDir: 'export-md',
        format: 'md',
      }),
    ).rejects.toMatchObject({ code: 'E_ARG_INVALID' });

    const out = join(parent, 'out');
    await mkdir(out, { recursive: true });
    const link = join(out, 'leak');
    await symlink(vault, link);
    await expect(
      exportVaultToMarkdown({
        vaultRoot: vault,
        cwd: parent,
        ref: 'nota.html',
        outDir: link,
        format: 'md',
      }),
    ).rejects.toMatchObject({ code: 'E_ARG_INVALID' });
  });
});

it('rejects attachment paths that leave the vault', async () => {
  await withVault(async (vault, parent) => {
    const secret = join(parent, 'secret.bin');
    await writeFile(secret, 'TOP-SECRET');
    await writeVaultText(
      vault,
      'mal.html',
      noteHtml('Mal', '<p><img src="../secret.bin" alt="x"></p>'),
    );
    const index = await openVaultIndex(vault);
    try {
      await index.rebuild();
    } finally {
      index.close();
    }
    const out = join(parent, 'out');
    await expect(
      exportVaultToMarkdown({
        vaultRoot: vault,
        cwd: parent,
        ref: 'mal.html',
        outDir: out,
        format: 'md',
      }),
    ).rejects.toMatchObject({ code: 'E_PATH_OUTSIDE_VAULT' });
  });
});

it('does not follow symlinks that point outside the vault when copying attachments', async () => {
  await withVault(async (vault, parent) => {
    const outside = join(parent, 'outside.png');
    await writeFile(outside, 'PNG');
    await mkdir(join(vault, 'attachments'), { recursive: true });
    await symlink(outside, join(vault, 'attachments', 'leak.png'));
    await writeVaultText(
      vault,
      'img.html',
      noteHtml('Img', '<p><img src="attachments/leak.png" alt="leak"></p>'),
    );
    const index = await openVaultIndex(vault);
    try {
      await index.rebuild();
    } finally {
      index.close();
    }
    const out = join(parent, 'out');
    await expect(
      exportVaultToMarkdown({
        vaultRoot: vault,
        cwd: parent,
        ref: 'img.html',
        outDir: out,
        format: 'md',
      }),
    ).rejects.toMatchObject({ code: 'E_PATH_OUTSIDE_VAULT' });
    const listed = await lstat(join(out, 'attachments', 'leak.png')).catch(() => null);
    expect(listed).toBeNull();
  });
});

it('writes only inside the resolved export directory', async () => {
  await withVault(async (vault, parent) => {
    await writeVaultText(vault, 'safe.html', noteHtml('Safe', '<p>ok</p>'));
    const index = await openVaultIndex(vault);
    try {
      await index.rebuild();
    } finally {
      index.close();
    }
    const out = join(parent, 'out');
    await exportVaultToMarkdown({
      vaultRoot: vault,
      cwd: parent,
      ref: 'safe.html',
      outDir: out,
      format: 'md',
    });
    const body = await readFile(join(out, 'safe.md'), 'utf8');
    expect(body).toContain('ok');
    await expect(resolveInsideExport(out, '../escape/leak.md')).rejects.toMatchObject({
      code: 'E_PATH_OUTSIDE_VAULT',
    });
  });
});
