# Markdown import fixtures (T2.12)

Obsidian-style vault used by REQ-MIG-02 through REQ-MIG-11 tests. It is not a Gaveta HTML vault: converters in T2.13–T2.18 read these `.md` files.

- **Manifest:** `manifest.json` lists each feature and the files that exercise it. Load it with `loadMarkdownManifest()` from `@gaveta/fixtures`.
- **Hub:** `indice.md` links to feature notes and to the corpus under `corpus/`.
- **Intentional gaps:** `no-soportado/` holds cases the importer is not required to map cleanly; see `no-soportado/README.md`.
- **Ignored on import:** `.obsidian/` (placeholder only).

Re-validate with `fixtures/src/markdown.test.ts` after changing files or the manifest.
