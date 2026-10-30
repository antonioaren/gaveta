# Gaveta

An Obsidian-style knowledge vault where every note is an HTML file, built for humans and AI agents.

![Global link graph](docs/assets/screenshot-graph.png)

> **Early preview (0.1.x)** — Active development; APIs and docs still move. The supported install path is the bash installer below (git checkout, not npm).

[Spanish documentation](docs/README.es.md) · [Roadmap](ROADMAP.md) · [Contributing](CONTRIBUTING.md) · [Agent guide](AGENTS.md)

## Why HTML instead of Markdown

- **Rich documents** — Callouts, tables, task lists, slides, and layout components are first-class in the authoring contract.
- **Agent-friendly** — HTML maps cleanly to artifact-style output from coding agents and chat UIs.
- **Self-contained notes** — One file per note: open with `file://`, archive, or diff in git without a renderer pipeline.
- **Agents write through the CLI** — The `gaveta` CLI and [agent skill](#agent-skill) teach the same HTML contract the app enforces.

## Features

| Area               | What you get                                                                                                                       |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| **Editors**        | Visual editor (TipTap) and code mode (CodeMirror 6), both saving through the core validator.                                       |
| **Tasks**          | Interactive checkboxes in the app; `gaveta todo` on the CLI.                                                                       |
| **Links**          | `[[wikilinks]]`, canonical `data-g-to` links, pending links, backlinks, graph queries.                                             |
| **Graph**          | Global and local graph views; ghost nodes for missing notes.                                                                       |
| **Markdown**       | `gaveta import` / `gaveta export` with documented round-trip limits.                                                               |
| **CLI**            | `gaveta` / `gv` for init, notes, links, graph, search, doctor, serve, MCP, and more — see [`gaveta guide`](docs/cli-reference.md). |
| **Local-first**    | `gaveta serve` on **127.0.0.1** only; SQLite index with FTS5; **Node ≥ 22.18**.                                                    |
| **Safe rendering** | Sandboxed iframe, strict CSP, render tickets (no session token in note URLs).                                                      |
| **i18n**           | User-facing CLI and web UI copy in **English and Spanish** (`--lang`, `GAVETA_LANG`, saved web locale).                            |

![Note view with theme and connections](docs/assets/screenshot-note.png)

## Install

**macOS (primary) and Linux.** Requires **Node.js ≥ 22.18** and **git**.

```bash
curl -fsSL https://raw.githubusercontent.com/antonioaren/gaveta/main/install.sh | bash
```

The installer (no flags) will:

- Clone or update `~/.local/share/gaveta` from `main` (full clone, so `gaveta update` works)
- Run `pnpm install` and build the web viewer
- Symlink **`gaveta`** and **`gv`** into **`~/.local/bin`**
- Create a starter vault at **`~/Gaveta`** if it does not exist yet
- Install the [agent skill](#agent-skill) when **`~/.cursor`** and/or **`~/.claude`** exists
- Write **`~/.local/share/gaveta/env.sh`** (and a marked block in your shell rc) so **`GAVETA_VAULT`** points at the starter vault

Options, manual install, updates, and uninstall: **[Installation guide](docs/installation.md)**.

## Quick start

After the one-line install, open a **new terminal** (or run `source ~/.local/share/gaveta/env.sh`), then:

```bash
gaveta serve
```

Open the **127.0.0.1** URL printed in the terminal (session token in the query string).

That is the whole path from zero: **install → serve → browse**. To add notes from the CLI or an agent, see **[Quick start (detailed)](docs/quick-start.md)**.

## Agent skill

Gaveta ships an **[Agent Skills](https://agentskills.io)** bundle (`skills/gaveta/`) generated from the same source as **`gaveta guide`**, so the skill does not duplicate the HTML contract.

| Mechanism                     | Command                                             | Where it lands                     |
| ----------------------------- | --------------------------------------------------- | ---------------------------------- |
| **Skill** (full workflow)     | `gaveta skill install --target cursor --scope user` | e.g. `~/.cursor/skills/gaveta/`    |
| **Vault rules** (short block) | `gaveta init --agent-instructions cursor`           | `<vault>/.cursor/rules/gaveta.mdc` |

The curl installer runs **`gaveta skill install --target … --scope user`** when it detects **`~/.cursor`** (Cursor) and/or **`~/.claude`** (Claude Code). Check versions with **`gaveta skill status`**.

Supported targets: **claude**, **cursor**, **codex**, **copilot**, **`all`**. Scopes: **project** (default) or **user**.

Typical agent flow: **`gaveta search`** → **`gaveta backlinks` / `gaveta graph --depth 1`** → **`gaveta new`** or **`gaveta edit --from -`** with **`[[wikilinks]]`** → **`gaveta validate`** / **`gaveta doctor`**. Use **`--json`** and **`--if-match`** on writes.

Full guide: **[Agent skill](docs/skill.md)**.

## MCP (Claude Code)

`gaveta mcp` exposes CLI commands as MCP tools on stdio (same JSON envelope as **`gaveta … --json`**). Register when `gaveta` is on your PATH:

```bash
claude mcp add gaveta -- gaveta mcp
```

Details: **[MCP](docs/mcp.md)**.

## CLI reference (summary)

| Group        | Commands                                          |
| ------------ | ------------------------------------------------- |
| Vault        | `init`, `adopt`, `reindex`                        |
| Notes        | `new`, `read`, `edit`, `validate`                 |
| Graph        | `links`, `backlinks`, `mentions`, `link`, `graph` |
| Organization | `mkdir`, `mv`, `rm`, folder ops, `meta`           |
| Tasks        | `todo`                                            |
| Quality      | `doctor`, `stats`                                 |
| Discovery    | `search`                                          |
| Migration    | `import`, `export`                                |
| Agents       | `skill`, `guide`                                  |
| Runtime      | `serve`, `mcp`                                    |
| Meta         | `version`, `update`                               |

Authoritative examples: **`gaveta guide`** · **[CLI reference](docs/cli-reference.md)**.

## Vault structure

Notes are HTML files; metadata lives in the document head (`gaveta:id`, `gaveta:type`, tags, aliases). Each vault has **`.gaveta/`** (`config.json`, `theme.css`, index). See **[Vault structure](docs/vault-structure.md)**.

## Configuration

**`GAVETA_VAULT`**, **`GAVETA_LANG`**, **`--vault`**, **`--json`**, **`--if-match`**, update remotes — **[Configuration](docs/configuration.md)**.

## Develop from source

For contributors: clone the repo, then **`pnpm install`** and **`pnpm check`**. The web dev server is **`pnpm dev`** (Vite on **127.0.0.1:5173**); **`gaveta serve`** serves the production build against a vault.

```bash
git clone https://github.com/antonioaren/gaveta.git
cd gaveta
corepack enable
pnpm install
pnpm check
pnpm dev
```

See **[AGENTS.md](AGENTS.md)** and **[Contributing](CONTRIBUTING.md)**.

## License

MIT — see [LICENSE](LICENSE).
