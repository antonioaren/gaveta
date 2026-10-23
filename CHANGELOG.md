# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Viewer connections panel: outgoing links, backlinks with plain-text context snippets, and a local force-layout graph with per-type node colors; navigation uses ULID refs via the shell router (REQ-APP-01).
- Type-specific render views for `doc` (lateral outline), `slides` (thumbnails and sandboxed presentation mode with keyboard navigation), and `todo` (read-only filters), plus wide layouts for Claude artifact types `dashboard`, `design`, and `artifact` (REQ-APP-06).
- Round-trip migration tests on `fixtures/markdown` with documented equivalence in `docs/migration-round-trip.md` (REQ-MIG-11): comparable mdast for Markdown → HTML → Markdown, semantic HTML snapshots for HTML → Markdown → HTML, and explicit lossy notes with required `W_IMPORT_UNSUPPORTED` / `W_EXPORT_LOSSY` warnings.
- Agent skill and `gaveta init --agent-instructions` blocks: import/export Markdown workflow (`--dry-run` first), aligned with `gaveta guide` (T2.19).
- `gaveta import` and polished `gaveta export`: CLI migration commands with shared `--json` summaries (`created`, `overwritten`, `renamed`, `skipped`, `failed`, `attachments`), Spanish human output, and `gaveta guide` examples (REQ-MIG-01–10, REQ-CLI-09).
- `gaveta export` and `exportVaultToMarkdown`: export one note, a folder, or `--all` to Markdown with folder hierarchy, attachment copy, `--links wiki|relative`, `--dry-run`, `--force`, and per-file `W_EXPORT_LOSSY` reporting (REQ-MIG-08).
- Core `importMarkdownFolder` API: recursive Markdown import (folder or single `.md` file) with two-pass link resolution, attachment deduplication, `dryRun`, `onConflict`, and atomic batch writes (`continueOnError`).
- `gaveta serve` / `gv serve`: read-only local API on `127.0.0.1` with per-session token, constant-time token check, strict Host/Origin validation, security headers on every response, and endpoints for `notes`, `read`, `links`, `backlinks`, `graph`, `search`, `doctor`, and authenticated `/api/session` (no token in API bodies; app bootstraps from `?token=` on the serve URL).
- `GET /render/:id` on the local server: sanitized note HTML with injected vault theme, strict CSP (`REQ-SEC-01`), vault-only scripts, and a `postMessage` navigation bridge for the viewer (`REQ-APP-02`). Sandboxed iframes authenticate with a 10-minute HMAC ticket from `GET /api/render-ticket?id=…` (`?t=` on render URLs; dedicated render secret; session token never in the query). Render file routes serve only note-referenced attachments (blocking `.gaveta/`, dotfiles, and `*.html`) with `Content-Security-Policy: default-src 'none'; sandbox`. Render responses use `frame-ancestors 'self'` and omit `X-Frame-Options: DENY`.

### Fixed

- Doc render layout no longer duplicates a nested `nav.toc` in the main column when the TOC sits below the top level.

### Changed

- `gaveta import` and `gaveta export` human output lists each failed source or export conflict with stable error code and Spanish reason (not only counts).
- Markdown import warns on mapped Obsidian callout kinds and `![[…]]` embeds (`W_IMPORT_UNSUPPORTED`); callout HTML uses paragraph breaks so md→html→md stays stable for supported callouts.

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
