# Roadmap

Gaveta is under active development. This is a phase-level view of where the project is headed. There are no release dates here—only the order of major milestones. Detail lives in [docs/PRD.md](docs/PRD.md) and [docs/TASKS.md](docs/TASKS.md).

## Phase 0 — Foundations

Monorepo, tooling, CI on Linux and macOS, security scanning, and shared test vaults. **Done.**

## Phase 1 — Core and CLI

HTML note contract, validation, SQLite index with full-text search, wikilinks and graph queries, transactional moves and deletes, and a full `gaveta` / `gv` CLI with JSON output. Agent skill and install helpers for Claude, Cursor, Codex, and Copilot. **Mostly done**; formal multi-agent gate exercises are still open.

## Phase 2 — Reader and Markdown interchange

Local Fastify server on loopback, React viewer (explorer, tabs, graph, search palette, health panel), sandboxed note rendering, file watcher and WebSocket updates, and CLI `import` / `export` for Markdown folders. **Reader and converters done**; a structured “daily driver” gate period is still open.

## Phase 3 — In-app editing

Visual editor (TipTap) and code mode (CodeMirror 6) backed by the same core operations as the CLI, interactive tasks, create/rename/move/delete from the UI, folders/tags/aliases in the app, Markdown import/export from the UI, and parity tests between API and CLI. **Largely in progress**—wikilink autocomplete in the editor and conflict UX are not finished; full app/CLI parity coverage is ongoing.

## Phase 4 — Next priorities

Planned enhancements include an MCP entry point, unlinked mentions, transclusion, aggregated task views, templates, usage stats, PDF export for slides, and Windows CI. None of these are required for the current early preview.

---

If you want to help, see [CONTRIBUTING.md](CONTRIBUTING.md). For newcomers, start with [README.md](README.md).
