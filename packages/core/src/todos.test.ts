import { copyFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { buildArtifactBody, readArtifactSrcdoc } from './artifact.ts';
import {
  GAVETA_DIRECTORY,
  addTaskToNote,
  checkTask,
  createDefaultVaultConfig,
  createNote,
  listTasks,
  noteContentHash,
  openVaultIndex,
  readVaultText,
  uncheckTask,
  writeVaultConfig,
} from './index.ts';

const NOW = '2026-10-22T12:00:00.000Z';
const ID_ARTIFACT = '01JC0F6R8T1G3H5J7K9M2N4P6Q';

const TASK_NOTE = [
  '<!doctype html>',
  '<html lang="es">',
  '  <head>',
  '    <meta charset="utf-8" />',
  '    <title>Tareas</title>',
  '    <meta name="gaveta:id" content="01JB7Z3K9QX4T5M2N8V6R0WYHC" />',
  '    <meta name="gaveta:type" content="todo" />',
  '    <meta name="gaveta:created" content="2026-10-22T00:00:00.000Z" />',
  '    <link rel="stylesheet" href=".gaveta/theme.css" />',
  '  </head>',
  '  <body>',
  '    <article>',
  '      <h1>Tareas</h1>',
  '      <ul class="tasks">',
  '        <li data-g-task="" id="abierta">',
  '          <input type="checkbox" />',
  '          Abierta',
  '        </li>',
  '        <li data-g-task="" id="hecha">',
  '          <input type="checkbox" checked />',
  '          Hecha',
  '        </li>',
  '      </ul>',
  '    </article>',
  '  </body>',
  '</html>',
  '',
].join('\n');

async function withTemp(run: (directory: string) => Promise<void>): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), 'gaveta-todos-'));
  try {
    await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function makeVault(parent: string): Promise<string> {
  const root = join(parent, 'vault');
  await mkdir(join(root, GAVETA_DIRECTORY), { recursive: true });
  await writeVaultConfig(root, createDefaultVaultConfig());
  return root;
}

async function seedTaskNote(root: string): Promise<void> {
  await writeFile(join(root, 'tareas.html'), TASK_NOTE);
  const index = await openVaultIndex(root);
  try {
    await index.rebuild();
  } finally {
    index.close();
  }
}

describe('addTaskToNote', () => {
  it('appends a task to the default task list', async () => {
    await withTemp(async (parent) => {
      const root = await makeVault(parent);
      await seedTaskNote(root);
      const added = await addTaskToNote({
        vaultRoot: root,
        ref: 'tareas.html',
        text: 'Comprar leche',
        due: '2026-10-23',
        priority: 'high',
      });
      expect(added.ok).toBe(true);
      if (!added.ok) {
        return;
      }
      expect(added.taskId).toBe('comprar-leche');
      const html = await readVaultText(root, 'tareas.html');
      expect(html).toContain('id="comprar-leche"');
      expect(html).toContain('data-g-due="2026-10-23"');
      expect(html).toContain('data-g-priority="high"');
      expect(html).toContain('Comprar leche');
      expect(html.startsWith(TASK_NOTE.slice(0, TASK_NOTE.indexOf('</ul>')))).toBe(true);
    });
  });

  it('adds tasks in the article body of an artifact note, not inside iframe srcdoc', async () => {
    await withTemp(async (parent) => {
      const root = await makeVault(parent);
      const artifact = await createNote({
        vaultRoot: root,
        title: 'Demo',
        type: 'artifact',
        html: buildArtifactBody({
          title: 'Demo',
          description: 'Demo',
          originalHtml:
            '<ul class="tasks"><li data-g-task="" id="embebida"><input type="checkbox" />Embebida</li></ul>',
          allowCdn: false,
        }),
        now: NOW,
        id: ID_ARTIFACT,
      });
      expect(artifact.ok).toBe(true);
      if (!artifact.ok) {
        return;
      }
      const before = await readVaultText(root, artifact.path);
      const srcdocBefore = readArtifactSrcdoc(before);
      expect(srcdocBefore).not.toBeNull();
      const added = await addTaskToNote({
        vaultRoot: root,
        ref: artifact.path,
        text: 'En el articulo',
      });
      expect(added.ok).toBe(true);
      if (!added.ok) {
        return;
      }
      const after = await readVaultText(root, artifact.path);
      expect(readArtifactSrcdoc(after)).toBe(srcdocBefore);
      expect(after).toContain('id="en-el-articulo"');
      expect(after).toContain('En el articulo');
      expect(after.indexOf('id="en-el-articulo"')).toBeGreaterThan(after.indexOf('<iframe'));
      expect(srcdocBefore?.includes('en-el-articulo') ?? false).toBe(false);
    });
  });

  it('escapes hostile task text instead of injecting markup', async () => {
    await withTemp(async (parent) => {
      const root = await makeVault(parent);
      await seedTaskNote(root);
      const hostile = '<script>alert(1)</script>';
      const added = await addTaskToNote({
        vaultRoot: root,
        ref: 'tareas.html',
        text: hostile,
      });
      expect(added.ok).toBe(true);
      const html = await readVaultText(root, 'tareas.html');
      expect(html.includes('<script>')).toBe(false);
      expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    });
  });
});

describe('checkTask and uncheckTask', () => {
  it('checks a task and only changes the checkbox tag bytes', async () => {
    await withTemp(async (parent) => {
      const root = await makeVault(parent);
      await seedTaskNote(root);
      const before = await readVaultText(root, 'tareas.html');
      const checked = await checkTask({
        vaultRoot: root,
        ref: 'tareas.html',
        taskId: 'abierta',
        ifMatch: noteContentHash(before),
      });
      expect(checked.ok).toBe(true);
      const after = await readVaultText(root, 'tareas.html');
      const linesBefore = before.split('\n');
      const linesAfter = after.split('\n');
      const liIndex = linesBefore.findIndex((line) => line.includes('id="abierta"'));
      expect(liIndex).toBeGreaterThan(-1);
      expect(linesBefore[liIndex]).toBe(linesAfter[liIndex]);
      const checkboxIndex = liIndex + 1;
      expect(linesBefore[checkboxIndex]).toBe('          <input type="checkbox" />');
      expect(linesAfter[checkboxIndex]).toBe('          <input type="checkbox" checked />');
      expect(linesBefore.slice(0, checkboxIndex)).toEqual(linesAfter.slice(0, checkboxIndex));
      expect(linesBefore.slice(checkboxIndex + 1)).toEqual(linesAfter.slice(checkboxIndex + 1));
    });
  });

  it('unchecks a task in place', async () => {
    await withTemp(async (parent) => {
      const root = await makeVault(parent);
      await seedTaskNote(root);
      const unchecked = await uncheckTask({
        vaultRoot: root,
        ref: 'tareas.html',
        taskId: 'hecha',
      });
      expect(unchecked.ok).toBe(true);
      if (!unchecked.ok) {
        return;
      }
      expect(unchecked.checked).toBe(false);
      const html = await readVaultText(root, 'tareas.html');
      expect(html.includes('id="hecha"')).toBe(true);
      const line = html
        .split('\n')
        .find((entry) => entry.includes('id="hecha"') || entry.includes('checked'));
      expect(line?.includes('checked')).toBe(false);
    });
  });

  it('reports a missing task id', async () => {
    await withTemp(async (parent) => {
      const root = await makeVault(parent);
      await seedTaskNote(root);
      await expect(
        checkTask({ vaultRoot: root, ref: 'tareas.html', taskId: 'ausente' }),
      ).rejects.toMatchObject({ code: 'E_TASK_NOT_FOUND' });
    });
  });
});

describe('listTasks', () => {
  it('lists open tasks across the vault from the index', async () => {
    await withTemp(async (parent) => {
      const root = join(parent, 'backlinks');
      const fixture = join(import.meta.dirname, '../../../fixtures/vaults/backlinks');
      await mkdir(join(root, '.gaveta'), { recursive: true });
      await copyFile(join(fixture, '.gaveta', 'config.json'), join(root, '.gaveta', 'config.json'));
      await mkdir(join(root, 'enlaces', 'mas'), { recursive: true });
      await copyFile(
        join(fixture, 'enlaces', 'mas', 'enlace-20.html'),
        join(root, 'enlaces', 'mas', 'enlace-20.html'),
      );
      const index = await openVaultIndex(root);
      try {
        await index.rebuild();
      } finally {
        index.close();
      }
      const listed = await listTasks({ vaultRoot: root, open: true });
      expect(listed.tasks.some((task) => task.taskId === 'revisar' && !task.checked)).toBe(true);
      expect(listed.tasks.every((task) => !task.checked)).toBe(true);
    });
  });

  it('filters tasks for one note', async () => {
    await withTemp(async (parent) => {
      const root = await makeVault(parent);
      await seedTaskNote(root);
      const listed = await listTasks({ vaultRoot: root, ref: 'tareas.html', done: true });
      expect(listed.tasks).toHaveLength(1);
      expect(listed.tasks[0]?.taskId).toBe('hecha');
    });
  });
});
