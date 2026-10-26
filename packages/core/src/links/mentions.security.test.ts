import '../sqlite/warning.ts';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { openVaultIndex } from '../sqlite/store.ts';
import { rewriteUnlinkedMentions, unlinkedMentions } from './mentions.ts';

const TARGET_ID = '01JB7Z3K9QX4T5M2N8V6R0WYHC';
const SOURCE_ID = '01JB7Z3K9QX4T5M2N8V6R0WYHD';
async function withVault(
  files: Record<string, string>,
  run: (root: string) => Promise<void>,
): Promise<void> {
  const parent = await mkdtemp(join(tmpdir(), 'gaveta-mentions-sec-'));
  const root = join(parent, 'vault');
  await mkdir(join(root, '.gaveta'), { recursive: true });
  await writeFile(
    join(root, '.gaveta/config.json'),
    '{"rel":{"vocabulary":["related"],"strict":false},"remoteAllowlist":[]}',
  );
  try {
    for (const [name, html] of Object.entries(files)) {
      await writeFile(join(root, name), html, 'utf8');
    }
    await run(root);
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
}

function noteHtml(title: string, id: string, body: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><meta name="gaveta:id" content="${id}"><meta name="gaveta:type" content="doc"><meta name="gaveta:created" content="2026-10-22T10:00:00Z"></head><body><article><h1>${title}</h1>${body}</article></body></html>`;
}

describe('mentions security', () => {
  it('escapes mention text when wrapping it in a canonical anchor', () => {
    const html = noteHtml('Origen', SOURCE_ID, '<p>Ver Roadmap &amp; más.</p>');
    const result = rewriteUnlinkedMentions({
      html,
      fromPath: 'origen.html',
      target: {
        id: TARGET_ID,
        path: 'target.html',
        title: 'Roadmap',
        aliases: [],
      },
    });
    expect(result.linked).toBe(1);
    expect(result.html).toContain('>Roadmap</a> &amp; más.');
    expect(result.html).not.toContain('<script>');
  });

  it('does not follow a traversal target path outside the vault', async () => {
    await withVault(
      {
        'target.html': noteHtml('Target', TARGET_ID, '<p>x</p>'),
        'origen.html': noteHtml('Origen', SOURCE_ID, '<p>Target aquí.</p>'),
      },
      async (root) => {
        const index = await openVaultIndex(root);
        await index.rebuild();
        await expect(unlinkedMentions(root, index, '../../secret.html')).rejects.toMatchObject({
          code: 'E_PATH_OUTSIDE_VAULT',
        });
        index.close();
      },
    );
  });
});
