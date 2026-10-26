import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createDefaultVaultConfig, createNote, readVaultText, writeVaultConfig } from '../index.ts';
import { withTemp } from './fixture.ts';
import { GAVETA_DIRECTORY } from './constants.ts';
import {
  applyNoteTemplateVariables,
  noteTemplateRelativePath,
  readNoteTemplateBody,
  resolveCreateNoteBodyHtml,
  writeDefaultNoteTemplates,
} from './templates.ts';

const NOW = '2026-10-22T12:00:00.000Z';
const ID = '01JB7Z3K9QX4T5M2N8V6R0WYHC';

async function makeVault(parent: string): Promise<string> {
  const root = join(parent, 'vault');
  await mkdir(join(root, GAVETA_DIRECTORY), { recursive: true });
  await writeVaultConfig(root, createDefaultVaultConfig());
  return root;
}

describe('note templates', () => {
  it('substitutes the title placeholder', () => {
    expect(applyNoteTemplateVariables('<h1>{{title}}</h1>', 'Hola & <b>')).toBe(
      '<h1>Hola &amp; &lt;b&gt;</h1>',
    );
  });

  it('reads a per-type template from .gaveta/templates', async () => {
    await withTemp(async (parent) => {
      const root = await makeVault(parent);
      const relative = noteTemplateRelativePath('doc');
      await mkdir(join(root, GAVETA_DIRECTORY, 'templates'), { recursive: true });
      await writeFile(
        join(root, relative),
        '<article><h1>{{title}}</h1><p data-g-template="yes">Plantilla</p></article>\n',
        'utf8',
      );
      const body = await readNoteTemplateBody(root, 'doc');
      expect(body).toContain('data-g-template="yes"');
    });
  });

  it('createNote uses the vault template when html is omitted', async () => {
    await withTemp(async (parent) => {
      const root = await makeVault(parent);
      await writeDefaultNoteTemplates(root);
      const relative = noteTemplateRelativePath('doc');
      await writeFile(
        join(root, relative),
        '<article><h1>{{title}}</h1><p data-g-template="custom">Cuerpo</p></article>\n',
        'utf8',
      );
      const created = await createNote({
        vaultRoot: root,
        title: 'Desde plantilla',
        type: 'doc',
        now: NOW,
        id: ID,
      });
      expect(created.ok).toBe(true);
      if (!created.ok) {
        return;
      }
      const html = await readVaultText(root, created.path);
      expect(html).toContain('data-g-template="custom"');
      expect(html).toContain('Desde plantilla');
      expect(html).not.toContain('{{title}}');
    });
  });

  it('explicit html overrides the vault template', async () => {
    await withTemp(async (parent) => {
      const root = await makeVault(parent);
      const relative = noteTemplateRelativePath('doc');
      await mkdir(join(root, GAVETA_DIRECTORY, 'templates'), { recursive: true });
      await writeFile(join(root, relative), '<article><p>Plantilla</p></article>', 'utf8');
      const created = await createNote({
        vaultRoot: root,
        title: 'Manual',
        type: 'doc',
        html: '<article><p>Manual body</p></article>',
        now: NOW,
        id: ID,
      });
      expect(created.ok).toBe(true);
      if (!created.ok) {
        return;
      }
      const html = await readVaultText(root, created.path);
      expect(html).toContain('Manual body');
      expect(html).not.toContain('Plantilla');
    });
  });

  it('resolveCreateNoteBodyHtml keeps null when no template exists', async () => {
    await withTemp(async (parent) => {
      const root = await makeVault(parent);
      const resolved = await resolveCreateNoteBodyHtml(root, 'doc', 'Título', null);
      expect(resolved).toBeNull();
    });
  });
});
