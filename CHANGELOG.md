# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- `gaveta import` and polished `gaveta export`: CLI migration commands with shared `--json` summaries (`created`, `overwritten`, `renamed`, `skipped`, `failed`, `attachments`), Spanish human output, and `gaveta guide` examples (REQ-MIG-01–10, REQ-CLI-09).
- `gaveta export` and `exportVaultToMarkdown`: export one note, a folder, or `--all` to Markdown with folder hierarchy, attachment copy, `--links wiki|relative`, `--dry-run`, `--force`, and per-file `W_EXPORT_LOSSY` reporting (REQ-MIG-08).
- Core `importMarkdownFolder` API: recursive Markdown import (folder or single `.md` file) with two-pass link resolution, attachment deduplication, `dryRun`, `onConflict`, and atomic batch writes (`continueOnError`).
- `gaveta serve` / `gv serve`: read-only local API on `127.0.0.1` with per-session token, constant-time token check, strict Host/Origin validation, security headers on every response, and endpoints for `notes`, `read`, `links`, `backlinks`, `graph`, `search`, `doctor`, and authenticated `/api/session` (no token in API bodies; app bootstraps from `?token=` on the serve URL).
- `GET /render/:id` on the local server: sanitized note HTML with injected vault theme, strict CSP (`REQ-SEC-01`), vault-only scripts, and a `postMessage` navigation bridge for the viewer (`REQ-APP-02`). Sandboxed iframes authenticate with a short-lived HMAC ticket from `GET /api/render-ticket?id=…` (`?t=` on render URLs; session token never in the query). Render responses use `frame-ancestors 'self'` and omit `X-Frame-Options: DENY`.

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
