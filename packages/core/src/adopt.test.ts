import { readFileSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { adoptNote, type AdoptedNote, type AdoptResult } from './adopt.ts';
import { createDefaultVaultConfig, writeVaultConfig } from './vault/config.ts';
import { withTemp } from './vault/fixture.ts';
import { openVaultIndex } from './sqlite/store.ts';
import { DEFAULT_THEME_CSS } from './theme/theme.ts';
import { validateNote } from './validate.ts';

const NOTE_ID = '01JB7Z3K9QX4T5M2N8V6R0WYHC';
const OTHER_ID = '01JB8A2M4R7C9D1E3F5G7H9J0K';
const CREATED = '2026-10-22T10:00:00.000Z';
const LATER = '2026-11-01T00:00:00.000Z';

function asAdopted(result: AdoptResult): AdoptedNote {
  if (!result.adopted) {
    throw new Error('expected the note to be adopted');
  }
  return result;
}

async function makeVault(parent: string): Promise<string> {
  const root = join(parent, 'vault');
  await mkdir(join(root, '.gaveta'), { recursive: true });
  await writeVaultConfig(root, createDefaultVaultConfig());
  await writeFile(join(root, '.gaveta/theme.css'), DEFAULT_THEME_CSS);
  const index = await openVaultIndex(root);
  index.close();
  return root;
}

it('adds the missing metadata, validates, and indexes a fragment', async () => {
  await withTemp(async (parent) => {
    const root = await makeVault(parent);
    await writeFile(join(root, 'nota.html'), '<p>Hola</p>\n');

    const result = asAdopted(
      await adoptNote(root, 'nota.html', {
        now: () => CREATED,
        createId: () => NOTE_ID,
      }),
    );

    expect(result).toMatchObject({
      id: NOTE_ID,
      path: 'nota.html',
      type: 'doc',
      title: 'nota',
    });
    expect(result.hash.startsWith('sha256:')).toBe(true);
    const html = await readFile(join(root, 'nota.html'), 'utf8');
    expect(html).toContain(`content="${NOTE_ID}"`);
    expect(html).toContain('content="doc"');
    expect(html).toContain(`content="${CREATED}"`);
    expect(html).toContain('<title>nota</title>');
    expect(html).toContain('<article>');
    expect(html).toContain('href=".gaveta/theme.css"');
    expect(validateNote(html, { notePath: 'nota.html' }).ok).toBe(true);

    const index = await openVaultIndex(root);
    try {
      const note = index.note('nota.html');
      expect(note?.id).toBe(NOTE_ID);
      expect(note?.title).toBe('nota');
      expect(note?.type).toBe('doc');
      expect(note?.contentHash).toBe(result.hash);
      expect(index.problems().filter((problem) => problem.path === 'nota.html')).toEqual([]);
    } finally {
      index.close();
    }

    const bytes = await readFile(join(root, 'nota.html'));
    const again = asAdopted(
      await adoptNote(root, 'nota.html', {
        now: () => LATER,
        createId: () => OTHER_ID,
      }),
    );
    expect(again.id).toBe(NOTE_ID);
    expect(again.hash).toBe(result.hash);
    expect(await readFile(join(root, 'nota.html'))).toEqual(bytes);
    expect(await readFile(join(root, 'nota.html'), 'utf8')).not.toContain(LATER);
    expect(await readFile(join(root, 'nota.html'), 'utf8')).not.toContain(OTHER_ID);
  });
});

it('keeps a valid id and prefers the title, then the first heading, over the filename', async () => {
  await withTemp(async (parent) => {
    const root = await makeVault(parent);
    await writeFile(
      join(root, 'desde-titulo.html'),
      '<html><head><title>Desde título</title></head><body><h1>Otro</h1></body></html>',
    );
    await writeFile(
      join(root, 'desde-h1.html'),
      '<html><body><h1>Sección Café</h1><p>Texto</p></body></html>',
    );

    const titled = asAdopted(
      await adoptNote(root, 'desde-titulo.html', {
        now: () => CREATED,
        createId: () => NOTE_ID,
      }),
    );
    expect(titled.title).toBe('Desde título');

    const headed = asAdopted(
      await adoptNote(root, 'desde-h1.html', {
        now: () => CREATED,
        createId: () => OTHER_ID,
      }),
    );
    expect(headed.title).toBe('Sección Café');
    expect(await readFile(join(root, 'desde-h1.html'), 'utf8')).toContain(
      '<title>Sección Café</title>',
    );
  });
});

it('keeps tags, aliases, and an existing id, and slugs colliding sections', async () => {
  await withTemp(async (parent) => {
    const root = await makeVault(parent);
    await mkdir(join(root, 'a', 'b'), { recursive: true });
    await writeFile(
      join(root, 'a/b/nota.html'),
      [
        '<article>',
        '  <h1>Título</h1>',
        '  <section><h2>Sección Café</h2><p>Uno</p></section>',
        '  <section><h2>Sección Café</h2><p>Dos</p></section>',
        '</article>',
        '<meta name="gaveta:tags" content="producto, prd">',
        '<meta name="gaveta:aliases" content="PRD Gaveta">',
        `<meta name="gaveta:id" content="${NOTE_ID}">`,
      ].join('\n'),
    );

    const result = asAdopted(
      await adoptNote(root, 'a/b/nota.html', {
        now: () => CREATED,
        createId: () => OTHER_ID,
      }),
    );
    expect(result.id).toBe(NOTE_ID);
    expect(result.path).toBe('a/b/nota.html');
    const html = await readFile(join(root, 'a/b/nota.html'), 'utf8');
    expect(html).toContain('id="seccion-cafe"');
    expect(html).toContain('id="seccion-cafe-2"');
    expect(html).toContain('href="../../.gaveta/theme.css"');
    expect(html).toContain('content="producto, prd"');
    expect(html).toContain('content="PRD Gaveta"');
    expect(html).not.toContain(OTHER_ID);
    expect(validateNote(html, { notePath: 'a/b/nota.html' }).ok).toBe(true);
  });
});

it('infers slides and todo from the markup', async () => {
  await withTemp(async (parent) => {
    const root = await makeVault(parent);
    await writeFile(join(root, 'deck.html'), '<section class="slide"><h1>Portada</h1></section>');
    await writeFile(
      join(root, 'tareas.html'),
      '<ul class="tasks"><li data-g-task>Revisar el contrato</li></ul>',
    );

    const slides = asAdopted(
      await adoptNote(root, 'deck.html', {
        now: () => CREATED,
        createId: () => NOTE_ID,
      }),
    );
    const todo = asAdopted(
      await adoptNote(root, 'tareas.html', {
        now: () => CREATED,
        createId: () => OTHER_ID,
      }),
    );
    expect(slides.type).toBe('slides');
    expect(todo.type).toBe('todo');
    expect(
      validateNote(await readFile(join(root, 'deck.html'), 'utf8'), { notePath: 'deck.html' }).ok,
    ).toBe(true);
    expect(
      validateNote(await readFile(join(root, 'tareas.html'), 'utf8'), { notePath: 'tareas.html' })
        .ok,
    ).toBe(true);
    const index = await openVaultIndex(root);
    try {
      expect(index.notes().map((note) => note.path)).toEqual(['deck.html', 'tareas.html']);
    } finally {
      index.close();
    }
  });
});

it('refuses a duplicate id and leaves the file untouched', async () => {
  await withTemp(async (parent) => {
    const root = await makeVault(parent);
    await writeFile(join(root, 'uno.html'), '<p>Uno</p>');
    await adoptNote(root, 'uno.html', { now: () => CREATED, createId: () => NOTE_ID });
    const original = `<p>Dos</p><meta name="gaveta:id" content="${NOTE_ID}">`;
    await writeFile(join(root, 'dos.html'), original);

    await expect(
      adoptNote(root, 'dos.html', { now: () => CREATED, createId: () => OTHER_ID }),
    ).rejects.toMatchObject({ code: 'E_ID_DUPLICATE' });

    expect(await readFile(join(root, 'dos.html'), 'utf8')).toBe(original);
    const index = await openVaultIndex(root);
    try {
      expect(index.note('dos.html')).toBeNull();
    } finally {
      index.close();
    }
  });
});

it('imports a Claude React artifact with CDN CSP metadata', async () => {
  await withTemp(async (parent) => {
    const root = await makeVault(parent);
    const source = readFileSync(
      join(import.meta.dirname, '../../../fixtures/claude/react-app.html'),
      'utf8',
    );
    await writeFile(join(root, 'react.html'), source);

    const result = asAdopted(
      await adoptNote(root, 'react.html', {
        source: 'claude',
        allowCdn: true,
        now: () => CREATED,
        createId: () => NOTE_ID,
      }),
    );
    expect(result.type).toBe('artifact');
    const html = await readFile(join(root, 'react.html'), 'utf8');
    expect(html).toContain('gaveta:artifact-cdn');
    expect(html).toContain('sandbox="allow-scripts"');
    expect(validateNote(html, { notePath: 'react.html' }).ok).toBe(true);
  });
});

it('adopts a Claude doc with Mermaid and drops CDN loaders', async () => {
  await withTemp(async (parent) => {
    const root = await makeVault(parent);
    const source = readFileSync(
      join(import.meta.dirname, '../../../fixtures/claude/mermaid-doc.html'),
      'utf8',
    );
    await writeFile(join(root, 'arquitectura.html'), source);
    const result = asAdopted(
      await adoptNote(root, 'arquitectura.html', {
        source: 'claude',
        now: () => CREATED,
        createId: () => NOTE_ID,
      }),
    );
    expect(result.type).toBe('doc');
    const html = await readFile(join(root, 'arquitectura.html'), 'utf8');
    expect(html).toContain('data-gaveta="mermaid-lib"');
    expect(html).not.toContain('cdn.jsdelivr.net');
    expect(html).toContain('<pre class="mermaid">');
    expect(validateNote(html, { notePath: 'arquitectura.html' }).ok).toBe(true);
  });
});

it('does not write when strict rel turns an unknown rel into an error', async () => {
  await withTemp(async (parent) => {
    const root = await makeVault(parent);
    const original = '<p><a href="https://example.com" rel="inventado">enlace</a></p>';
    await writeFile(join(root, 'nota.html'), original);

    const rejected = await adoptNote(root, 'nota.html', {
      now: () => CREATED,
      createId: () => NOTE_ID,
      strictRel: true,
    });
    expect(rejected.adopted).toBe(false);
    expect(rejected.warnings.map((warning) => warning.code)).toContain('W_REL_UNKNOWN');
    expect(await readFile(join(root, 'nota.html'), 'utf8')).toBe(original);
  });
});
