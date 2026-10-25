# Gaveta

An Obsidian-style knowledge vault where every note is an HTML file, built for humans and AI agents.

![Global link graph](docs/assets/screenshot-graph.png)

> **Status — early preview**  
> Gaveta is a work in progress. It is **not** published to npm or shipped as an installer yet. Expect rough edges, incomplete docs, and breaking changes. If you want to try it today, clone the repo and build from source (below).

[Spanish documentation](docs/README.es.md) · [Roadmap](ROADMAP.md) · [Contributing](CONTRIBUTING.md) · [Agent guide](AGENTS.md)

## Why HTML instead of Markdown

- **Rich documents** — Callouts, tables, task lists, slides, and layout components are first-class in the authoring contract, not bolted on later.
- **Claude-friendly** — HTML maps cleanly to artifact-style output from coding agents and chat UIs.
- **Self-contained notes** — A note is one file you can open with `file://`, archive, or diff in git without a renderer pipeline.
- **Agents can write it** — The `gaveta` CLI and skill teach models the same HTML contract the app enforces.

## What works today

| Area               | What you get                                                                                                                                             |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Editors**        | Visual editor (TipTap) and code mode (CodeMirror 6) in the web app, both saving through the core validator.                                              |
| **Tasks**          | Interactive checkboxes in the reader and editor; CLI `gaveta todo` for the same data.                                                                    |
| **Links**          | `[[wikilinks]]`, canonical `data-g-to` links, pending links, backlinks with context, and graph queries (CLI + app).                                      |
| **Graph**          | Global and local graph views with filters; ghost nodes for missing notes.                                                                                |
| **Organization**   | Folders, tags, and aliases in the vault, explorer, and note metadata (CLI and app).                                                                      |
| **Markdown**       | `gaveta import` / `gaveta export` for folders and notes; round-trip tests on fixtures (some lossy cases are documented).                                 |
| **CLI**            | `gaveta` / `gv` at parity with vault operations: init, new, read, edit, links, graph, search, doctor, mv, rm, adopt, serve, and more—see `gaveta guide`. |
| **Local-first**    | `gaveta serve` binds **127.0.0.1** only (Fastify); index in **node:sqlite** with FTS5; **Node ≥ 22.18** required.                                        |
| **Safe rendering** | Notes render in a **sandboxed iframe** with a strict CSP and render tickets (no session token in note URLs).                                             |
| **Concurrency**    | Optimistic writes with **`If-Match`** / `--if-match` on CLI and API so concurrent edits fail safely instead of silently overwriting.                     |

![Note view with theme and connections](docs/assets/screenshot-note.png)

## Build from source

**Requirements:** Node.js ≥ 22.18, pnpm 10 (via `corepack enable`).

```bash
git clone https://github.com/antonioaren/gaveta.git
cd gaveta
corepack enable
pnpm install
pnpm check          # optional but recommended — same gate as CI
pnpm dev            # web UI at http://127.0.0.1:5173
pnpm exec gaveta version
```

Run the API and viewer together:

```bash
pnpm exec gaveta serve --vault /path/to/your-vault
```

Symlink the CLI into your PATH (optional):

```bash
mkdir -p ~/.local/bin
ln -sf "$(pwd)/packages/cli/bin/gaveta.js" ~/.local/bin/gaveta
ln -sf "$(pwd)/packages/cli/bin/gaveta.js" ~/.local/bin/gv
```

There is no supported global install yet; git checkout + symlink (or `pnpm exec gaveta`) is the intended path for early adopters.

### Quick try from the CLI

From the repo root, without installing globally (`pnpm exec` runs the workspace binary):

```bash
pnpm exec gaveta init mi-vault --json

echo '<article><h1>Other</h1><section id="cuerpo"><p>Nota de referencia.</p></section></article>' \
  | pnpm exec gaveta new "Other" --type doc --vault mi-vault --from - --json

echo '<article><h1>Origen</h1><section id="cuerpo"><p>Ver [[Other]]</p></section></article>' \
  | pnpm exec gaveta new "Origen" --type doc --vault mi-vault --from - --json

pnpm exec gaveta read Origen --as outline --vault mi-vault --json

echo '<p>Más texto.</p>' \
  | pnpm exec gaveta edit Origen --vault mi-vault --section cuerpo --append --from - --json

pnpm exec gaveta search Other --vault mi-vault --json
```

On macOS you can open a note in the default browser via `file://` after `gaveta init` copies the theme into the vault.

## How it is built

Gaveta is developed with **AI coding agents** under a **test-driven** workflow: failing tests first, then implementation. **GitHub Actions** runs the full gate on **Linux and macOS** (format, lint, typecheck, unit tests with coverage, CLI e2e, Playwright where applicable, dependency and secret scanning).

Deeper product and requirement docs:

- [PRD](docs/PRD.md)
- [Requirements](docs/REQUIREMENTS.md)
- [Task plan](docs/TASKS.md) (internal execution detail)

## Repository layout

```
packages/core/    Shared contract, parser, vault, index, operations
packages/cli/     gaveta / gv binary
packages/server/  Local API, watcher, WebSocket
apps/web/         React + Vite viewer and editor
skills/gaveta/    Agent skill for CLI workflows
fixtures/         Test vaults and Markdown samples
```

## License

MIT — see [LICENSE](LICENSE).
