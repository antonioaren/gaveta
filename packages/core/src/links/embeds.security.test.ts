import '../sqlite/warning.ts';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { openVaultIndex } from '../sqlite/store.ts';
import { replaceEmbedsWithLinks } from './embeds.ts';

const HOST_ID = '01M5HGV8800000000000000011';

function noteHtml(id: string, body: string): string {
  return `<!doctype html><html><head><meta name="gaveta:id" content="${id}"><meta name="gaveta:type" content="doc"><meta name="gaveta:created" content="2026-10-22T10:00:00Z"></head><body><article>${body}</article></body></html>`;
}

describe('embed security', () => {
  it('does not treat traversal-like section ids as vault paths', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'gaveta-embed-sec-'));
    const root = join(parent, 'vault');
    try {
      await mkdir(join(root, '.gaveta'), { recursive: true });
      await writeFile(
        join(root, '.gaveta/config.json'),
        JSON.stringify({
          rel: {
            vocabulary: ['related', 'depends-on', 'part-of', 'supersedes', 'references'],
            strict: false,
          },
          remoteAllowlist: [],
        }),
        'utf8',
      );
      const embed =
        '<gaveta-embed data-g-to="01M5HGV8800000000000000012" data-g-section="../../../etc/passwd"></gaveta-embed>';
      await writeFile(join(root, 'host.html'), noteHtml(HOST_ID, embed), 'utf8');
      const index = await openVaultIndex(root);
      await index.rebuild();
      const html = await import('node:fs/promises').then((fs) =>
        fs.readFile(join(root, 'host.html'), 'utf8'),
      );
      const out = replaceEmbedsWithLinks(html, 'host.html', index);
      expect(out).toContain('data-g-code="W_EMBED_SECTION_MISSING"');
      expect(out).not.toContain('etc/passwd');
      index.close();
    } finally {
      await rm(parent, { recursive: true, force: true });
    }
  });

  it('rejects forged data-g-to values that are not ulids', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'gaveta-embed-sec-'));
    const root = join(parent, 'vault');
    try {
      await mkdir(join(root, '.gaveta'), { recursive: true });
      await writeFile(
        join(root, '.gaveta/config.json'),
        JSON.stringify({
          rel: {
            vocabulary: ['related', 'depends-on', 'part-of', 'supersedes', 'references'],
            strict: false,
          },
          remoteAllowlist: [],
        }),
        'utf8',
      );
      const embed =
        '<gaveta-embed data-g-to="../../../etc/passwd" data-g-section="resumen"></gaveta-embed>';
      await writeFile(join(root, 'host.html'), noteHtml(HOST_ID, embed), 'utf8');
      const index = await openVaultIndex(root);
      await index.rebuild();
      const html = await import('node:fs/promises').then((fs) =>
        fs.readFile(join(root, 'host.html'), 'utf8'),
      );
      const out = replaceEmbedsWithLinks(html, 'host.html', index);
      expect(out).toContain('gaveta-embed');
      index.close();
    } finally {
      await rm(parent, { recursive: true, force: true });
    }
  });
});
