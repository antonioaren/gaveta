import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { vaultPath } from '@gaveta/fixtures';
import { openVaultIndex } from '../sqlite/store.ts';
import {
  appendRenderTicketQuery,
  buildNoteRenderCsp,
  buildNoteRenderPage,
  readRenderNoteId,
  resolveRenderNote,
} from './note-page.ts';

const TICKET = '01M5HGV8800000000000000011.1700000060.fake-signature-for-unit-test';

const TEST_SERVE_PORT = 4711;

it('buildNoteRenderCsp matches REQ-SEC-01 with hardening directives', () => {
  const origin = `http://127.0.0.1:${String(TEST_SERVE_PORT)}`;
  const csp = buildNoteRenderCsp(TEST_SERVE_PORT);
  expect(csp).toContain("default-src 'none'");
  expect(csp).toContain("object-src 'none'");
  expect(csp).toContain("base-uri 'none'");
  expect(csp).toContain(`style-src 'self' ${origin} 'unsafe-inline'`);
  expect(csp).toContain(`img-src 'self' ${origin} data:`);
  expect(csp).toContain(`font-src 'self' ${origin}`);
  expect(csp).toContain(`script-src 'self' ${origin}`);
  expect(csp).toContain("frame-ancestors 'self'");
});

it('rejects a non-ulid render id', () => {
  expect(() => {
    readRenderNoteId('../../../etc/passwd');
  }).toThrow();
});

it('strips script tags and event handlers from malicious fixture notes', async () => {
  const parent = mkdtempSync(join(tmpdir(), 'gaveta-render-core-'));
  const vaultRoot = join(parent, 'vault');
  cpSync(vaultPath('malicious'), vaultRoot, { recursive: true });
  const index = await openVaultIndex(vaultRoot);
  await index.rebuild();
  const note = resolveRenderNote(index, '01M5HGV8800000000000000011');
  const noteId = note.id;
  if (noteId === null) {
    throw new Error('expected indexed note id');
  }
  const source = readFileSync(join(vaultRoot, note.path), 'utf8');
  const page = buildNoteRenderPage({
    noteId,
    notePath: note.path,
    title: note.title,
    sourceHtml: source,
    port: TEST_SERVE_PORT,
    renderTicket: TICKET,
    remoteAllowlist: [],
  });
  const body = page.slice(page.indexOf('<body>') + '<body>'.length, page.indexOf('</body>'));
  expect(body).not.toMatch(/<script(?:\s|>)/iu);
  expect(page).toContain(appendRenderTicketQuery('/render/static/render-bridge.js', TICKET));
  expect(page).not.toContain('alert(1)');
  expect(page).not.toContain('onerror=');
  expect(page).not.toContain('onclick=');
  expect(page).not.toContain('onload=');
  expect(page).not.toContain('evil.example');
  expect(page).toContain('http-equiv="content-security-policy"');
  index.close();
  rmSync(parent, { recursive: true, force: true });
});

it('includes the navigation bridge script from same origin only', () => {
  const vaultRoot = vaultPath('backlinks');
  const source = readFileSync(join(vaultRoot, 'nota-x.html'), 'utf8');
  const page = buildNoteRenderPage({
    noteId: '01JB7Z3K9QX4T5M2N8V6R0WYHC',
    notePath: 'nota-x.html',
    title: 'Nota X',
    sourceHtml: source,
    port: TEST_SERVE_PORT,
    renderTicket: TICKET,
    remoteAllowlist: [],
  });
  expect(page).toContain(appendRenderTicketQuery('/render/static/render-bridge.js', TICKET));
  expect(page).not.toContain('render-bridge.js" integrity');
});
