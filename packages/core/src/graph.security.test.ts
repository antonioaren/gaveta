import './sqlite/warning.ts';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { expect, it } from 'vitest';
import { noteUlid, vaultPath } from '@gaveta/fixtures';
import {
  GavetaError,
  backlinks,
  globalGraph,
  localGraph,
  openVaultIndex,
  outgoingLinks,
  type VaultIndex,
} from './index.ts';

const PAYLOAD = `'); DROP TABLE notes;--`;
const SECRET = 'TOP-SECRET-OUTSIDE';

function noteHtml(title: string, id: string, body: string): string {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${title}</title><meta name="gaveta:id" content="${id}"><meta name="gaveta:type" content="doc"><meta name="gaveta:created" content="2026-10-22T10:00:00Z"></head><body><article><h1>${title}</h1>${body}</article></body></html>`;
}

async function withTemp(run: (directory: string) => Promise<void>): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), 'gaveta-graph-sec-'));
  try {
    await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function makeVault(parent: string): Promise<string> {
  const root = join(parent, 'vault');
  await mkdir(join(root, '.gaveta'), { recursive: true });
  return root;
}

async function writeNote(root: string, relativePath: string, html: string): Promise<void> {
  const absolute = join(root, ...relativePath.split('/'));
  await mkdir(dirname(absolute), { recursive: true });
  await writeFile(absolute, html);
}

async function indexed(root: string, run: (index: VaultIndex) => void): Promise<void> {
  const index = await openVaultIndex(root);
  try {
    await index.rebuild();
    run(index);
  } finally {
    index.close();
  }
}

it('treats injected SQL as data and does not execute it', async () => {
  await withTemp(async (parent) => {
    const root = await makeVault(parent);
    const id = noteUlid(3, 1);
    await writeNote(
      root,
      'a.html',
      noteHtml(
        PAYLOAD,
        id,
        `<p><a data-g-pending="${PAYLOAD}" rel="related">${PAYLOAD}</a></p><p>sqlite</p>`,
      ),
    );
    await indexed(root, (index) => {
      const graph = globalGraph(index, { tag: PAYLOAD, rel: PAYLOAD });
      expect(graph.nodes).toEqual([]);
      expect(graph.edges).toEqual([]);
      const stored = globalGraph(index);
      expect(stored.nodes.map((node) => node.title)).toContain(PAYLOAD);
      expect(stored.nodes.some((node) => node.ghost && node.title === PAYLOAD)).toBe(true);
      expect(backlinks(index, id)).toEqual([]);
      expect(outgoingLinks(index, PAYLOAD)[0]?.text).toBe(PAYLOAD);
      expect(index.notes()).toHaveLength(1);
      expect(index.note('a.html')?.title).toBe(PAYLOAD);
      expect(index.search('sqlite')).toHaveLength(1);
    });
  });
});

it('does not read outside the vault when a ref or folder tries to escape', async () => {
  await withTemp(async (parent) => {
    const root = await makeVault(parent);
    const secret = join(parent, 'secret.html');
    await writeFile(secret, noteHtml('Secreto', noteUlid(3, 2), SECRET));
    await writeNote(root, 'a.html', noteHtml('Alfa', noteUlid(3, 3), 'visible'));
    await indexed(root, (index) => {
      expect(() => localGraph(index, '../secret.html', { depth: 1 })).toThrow(GavetaError);
      expect(() => localGraph(index, secret, { depth: 1 })).toThrow(GavetaError);
      expect(() => globalGraph(index, { folder: '../secret' })).toThrow(GavetaError);
      expect(() => globalGraph(index, { folder: 'notes/../../secret' })).toThrow(GavetaError);
      expect(() => outgoingLinks(index, '../secret.html')).toThrow(GavetaError);
      expect(() => backlinks(index, '/etc/passwd')).toThrow(GavetaError);
      const graph = globalGraph(index);
      expect(JSON.stringify(graph)).not.toContain(SECRET);
      expect(graph.nodes.map((node) => node.path)).toEqual(['a.html']);
      expect(index.notes()).toHaveLength(1);
    });
    expect(await readFile(secret, 'utf8')).toContain(SECRET);
  });
});

it('does not turn traversal or javascript hrefs into graph nodes', async () => {
  await withTemp(async (parent) => {
    const root = join(parent, 'malicious');
    await cp(vaultPath('malicious'), root, { recursive: true });
    await indexed(root, (index) => {
      const graph = globalGraph(index);
      for (const node of graph.nodes) {
        if (node.path === null) {
          expect(node.ghost).toBe(true);
          continue;
        }
        expect(node.path.startsWith('/')).toBe(false);
        expect(node.path.includes('..')).toBe(false);
        expect(node.path.includes('\\')).toBe(false);
      }
      for (const edge of graph.edges) {
        expect(edge.source.includes('..')).toBe(false);
        expect(edge.target.startsWith('/')).toBe(false);
        expect(edge.target).not.toContain('/etc/passwd');
      }
      const outgoing = outgoingLinks(index, 'path-traversal.html');
      expect(outgoing.map((link) => link.href)).toEqual([
        '../../fuera.html',
        '/etc/passwd',
        '..\\..\\fuera.html',
      ]);
      expect(outgoing.every((link) => link.target.path === null && !link.target.ghost)).toBe(true);
      expect(graph.edges.some((edge) => edge.source === 'path-traversal.html')).toBe(false);
      const scripts = outgoingLinks(index, 'url-javascript.html');
      expect(scripts.every((link) => link.kind === 'external')).toBe(true);
      expect(scripts.every((link) => link.target.path === null)).toBe(true);
      expect(JSON.stringify(graph)).not.toContain('javascript:');
      expect(index.notes().length).toBe(graph.nodes.filter((node) => !node.ghost).length);
    });
  });
});

it('rejects an out-of-range depth before walking a long chain', async () => {
  await withTemp(async (parent) => {
    const root = await makeVault(parent);
    const count = 20;
    for (let index = 0; index < count; index += 1) {
      const next = index + 1;
      const body =
        next === count
          ? '<p>Fin</p>'
          : `<p><a href="n.html" data-g-to="${noteUlid(4, next)}" rel="related">Siguiente</a></p>`;
      await writeNote(
        root,
        `n${String(index)}.html`,
        noteHtml(`Nota ${String(index)}`, noteUlid(4, index), body),
      );
    }
    await indexed(root, (index) => {
      expect(() => localGraph(index, 'n0.html', { depth: 20 })).toThrow(GavetaError);
      expect(() => localGraph(index, 'n0.html', { depth: 0 })).toThrow(GavetaError);
      const local = localGraph(index, 'n0.html', { depth: 3 });
      expect(local.nodes).toHaveLength(4);
      expect(local.nodes.map((node) => node.path)).toEqual([
        'n0.html',
        'n1.html',
        'n2.html',
        'n3.html',
      ]);
      expect(local.nodes).toHaveLength(new Set(local.nodes.map((node) => node.key)).size);
    });
  });
});
