# Markdown migration round-trip (REQ-MIG-11)

This document defines how Gaveta tests **import** and **export** symmetry on `fixtures/markdown/`. The automated suite lives in `packages/core/src/convert/round-trip.test.ts` and `e2e/round-trip.test.ts`.

## Markdown → HTML → Markdown

**Scope:** body content after YAML front matter is stripped on both sides. Export may add `created`, `type`, or `gaveta:` keys in front matter; those fields are not compared.

**Equivalence:** the [mdast](https://github.com/syntax-tree/mdast) trees of the original and round-tripped Markdown are equal after:

1. Parsing with `remark-parse`, `remark-gfm` (single tilde disabled), and `remark-frontmatter`.
2. Removing source positions from every node.
3. Collapsing runs of whitespace to a single space in string nodes.
4. Normalizing `image` URLs and attachment links to their basename (so `![[pixel.png]]` versus `![](../attachments/pixel.png)` can be compared).

**Supported subset:** every manifest note except those listed in `fixtures/markdown/manifest.json` → `roundTrip.lossyMarkdown`.

**Lossy notes:** must **not** be mdast-equivalent (except when only import metadata differs but the body mdast still matches). When `requireImportWarnings` / `requireExportWarnings` / `requireExportLossDetails` are set on a lossy entry, the round-trip must emit those codes and `W_EXPORT_LOSSY` params (`detail`) for each listed loss. Import-time degradations are stamped on `<article data-g-import-losses="…">` and re-exported as `import-loss:<detail>`.

## HTML → Markdown → HTML

**Scope:** a note already in the vault (after a full-folder import of the markdown fixture).

**Equivalence:** `noteSemanticSnapshot` compares:

| Field | Rule |
| --- | --- |
| `gaveta:id` | unchanged (`--on-conflict overwrite` keeps the replaced note id) |
| Title | same string |
| Tags / aliases | same sets |
| Tasks | same text and `checked` state |
| Links | same kind, text, `targetId`, and `pendingTitle` |

Raw HTML bytes may differ (normalization, theme paths). Semantic fields above must match after exporting to Markdown and importing back with `onConflict: 'overwrite'`.

## Known lossy constructs (not silent)

| Construct | Typical warning | Documented in manifest |
| --- | --- | --- |
| Obsidian callout kinds mapped to contract kinds | `W_IMPORT_UNSUPPORTED` (`callout-kind-*`) | `contenido/callouts-completos.md` |
| Foldable callouts (`+` / `-`) | `W_IMPORT_UNSUPPORTED` (`callout-fold`) | `contenido/callouts-plegables.md` |
| Wikilink embeds `![[file]]` | `W_IMPORT_UNSUPPORTED` (`wiki-embed`) | `contenido/imagenes.md` |
| GFM table alignment | (mdast differs) | `contenido/tablas.md` |
| Obsidian task date emoji / inline dates | (mdast differs) | `tareas/tareas-fechas.md` |
| Marp / slides separators | (mdast differs) | `presentacion/diapositivas-marp.md` |
| Raw HTML, footnotes, remote images, embeds | (mdast differs; see feature entries under `no-soportado/`) | `no-soportado/*.md` |

Attachments are copied on import and export; byte identity is tested via the CLI e2e import/export flow, not via mdast.
