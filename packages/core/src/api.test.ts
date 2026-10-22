import { expect, it } from 'vitest';
import {
  GavetaError,
  allocateSlug,
  createDefaultVaultConfig,
  discoverVault,
  parseVaultConfig,
  readVaultConfig,
  readVaultText,
  resolveInsideVault,
  slugify,
  writeAtomic,
  writeVaultConfig,
  writeVaultText,
  INDEX_SCHEMA_VERSION,
  openVaultIndex,
  foldMatchKey,
  BACKLINK_CONTEXT_LIMIT,
  GRAPH_DEPTH_MAX,
  GRAPH_DEPTH_MIN,
  adoptNote,
  doctorVault,
  backlinks,
  globalGraph,
  initVault,
  graphGhostKey,
  localGraph,
  outgoingLinks,
  resolveRef,
  resolveTitle,
  promotePendingAnchors,
  promotePendingLinks,
  createNote,
  editNote,
  noteContentHash,
  readNote,
  resolveNoteLinks,
  suggestNotes,
  relativeNoteHref,
  assessRel,
  GavetaRefError,
  SUGGESTION_LIMIT,
  GavetaOperationError,
  moveNote,
  removeNote,
} from './index.ts';

it('exports vault I/O and the shared slug helper from the package entry', () => {
  expect(typeof slugify).toBe('function');
  expect(typeof allocateSlug).toBe('function');
  expect(typeof discoverVault).toBe('function');
  expect(typeof resolveInsideVault).toBe('function');
  expect(typeof readVaultText).toBe('function');
  expect(typeof writeVaultText).toBe('function');
  expect(typeof writeAtomic).toBe('function');
  expect(typeof createDefaultVaultConfig).toBe('function');
  expect(typeof parseVaultConfig).toBe('function');
  expect(typeof readVaultConfig).toBe('function');
  expect(typeof writeVaultConfig).toBe('function');
  expect(GavetaError.prototype).toBeInstanceOf(Error);
  expect(typeof openVaultIndex).toBe('function');
  expect(typeof foldMatchKey).toBe('function');
  expect(INDEX_SCHEMA_VERSION).toBe(2);
  expect(typeof globalGraph).toBe('function');
  expect(typeof localGraph).toBe('function');
  expect(typeof outgoingLinks).toBe('function');
  expect(typeof backlinks).toBe('function');
  expect(graphGhostKey('Nota')).toBe('ghost:Nota');
  expect(GRAPH_DEPTH_MIN).toBe(1);
  expect(GRAPH_DEPTH_MAX).toBe(3);
  expect(BACKLINK_CONTEXT_LIMIT).toBe(200);
  expect(typeof resolveRef).toBe('function');
  expect(typeof resolveTitle).toBe('function');
  expect(typeof promotePendingAnchors).toBe('function');
  expect(typeof promotePendingLinks).toBe('function');
  expect(typeof createNote).toBe('function');
  expect(typeof readNote).toBe('function');
  expect(typeof editNote).toBe('function');
  expect(noteContentHash('hola')).toBe(
    'sha256:b221d9dbb083a7f33428d7c2a3c3198ae925614d70210e28716ccaa7cd4ddb79',
  );
  expect(typeof resolveNoteLinks).toBe('function');
  expect(typeof suggestNotes).toBe('function');
  expect(typeof relativeNoteHref).toBe('function');
  expect(typeof assessRel).toBe('function');
  expect(GavetaRefError.prototype).toBeInstanceOf(GavetaError);
  expect(SUGGESTION_LIMIT).toBe(5);
  expect(typeof initVault).toBe('function');
  expect(typeof adoptNote).toBe('function');
  expect(typeof doctorVault).toBe('function');
  expect(typeof moveNote).toBe('function');
  expect(typeof removeNote).toBe('function');
  expect(GavetaOperationError.prototype).toBeInstanceOf(GavetaError);
});
