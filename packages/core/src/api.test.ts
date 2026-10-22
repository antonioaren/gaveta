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
  expect(typeof resolveNoteLinks).toBe('function');
  expect(typeof suggestNotes).toBe('function');
  expect(typeof relativeNoteHref).toBe('function');
  expect(typeof assessRel).toBe('function');
  expect(GavetaRefError.prototype).toBeInstanceOf(GavetaError);
  expect(SUGGESTION_LIMIT).toBe(5);
  expect(typeof initVault).toBe('function');
  expect(typeof adoptNote).toBe('function');
<<<<<<< HEAD
  expect(typeof moveNote).toBe('function');
  expect(typeof removeNote).toBe('function');
  expect(GavetaOperationError.prototype).toBeInstanceOf(GavetaError);
=======
  expect(typeof doctorVault).toBe('function');
>>>>>>> 4790197 (T1.12: add core doctorVault scan and --fix for href and theme)
});
