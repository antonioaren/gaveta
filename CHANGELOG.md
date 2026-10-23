# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- `gaveta export` and `exportVaultToMarkdown`: export one note, a folder, or `--all` to Markdown with folder hierarchy, attachment copy, `--links wiki|relative`, `--dry-run`, `--force`, and per-file `W_EXPORT_LOSSY` reporting (REQ-MIG-08).

## [0.1.0] - 2026-10-22

### Added

- Monorepo with `@gaveta/core`, `@gaveta/cli`, `@gaveta/server`, and `@gaveta/web`.
- HTML note contract, parser, validator, normalizer, and default vault theme with AA contrast.
- Vault discovery, atomic writes, SQLite FTS index, link resolution, graph queries, and transactional `mv` / `rm`.
- CLI commands: `init`, `adopt`, `new`, `read`, `edit`, `search`, `links`, `backlinks`, `link`, `graph`, `todo`, `validate`, `doctor`, `reindex`, `guide`, and `skill`.
- Agent skill generation and install for Claude, Cursor, Codex, and Copilot.
- Markdown import and export converters (Obsidian wikilinks, callouts, tasks, mermaid, slides).
- Claude artifact types (`dashboard`, `design`, `artifact`) and adoption from Claude HTML exports.
- Phase 1 e2e acceptance tests and Playwright theme showcase coverage.

[0.1.0]: https://github.com/antonioaren/gaveta/releases/tag/v0.1.0
