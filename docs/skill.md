# Agent skill

Gaveta agents write **only through the CLI** (`gaveta` / `gv`). They must not hand-edit vault files or invent HTML outside the contract in **`gaveta guide`**.

The **skill** is an [Agent Skills](https://agentskills.io) bundle: **`SKILL.md`** plus short references (`references/flujo.md`, `references/tipos-de-nota.md`). It is **generated from the same source as `gaveta guide`**, versioned with the CLI (`gaveta-cli-version` in front matter), and kept in sync via **`gaveta skill install`**.

Skill text is written for agents (today primarily **Spanish** prose in the bundle); the CLI and web UI support **English and Spanish** via **`@gaveta/i18n`**.

## Skill vs vault instructions

| | Skill | Vault instructions |
| --- | --- | --- |
| **Install** | `gaveta skill install --target …` | `gaveta init --agent-instructions …` |
| **Purpose** | Full workflow, search-before-create, `--json`, `--if-match` | Short delimited block in agent config files |
| **Cursor** | `.cursor/skills/gaveta/` (project or user) | `.cursor/rules/gaveta.mdc` in the vault |
| **Claude Code** | `.claude/skills/gaveta/` | `CLAUDE.md` in the vault |
| **Codex / others** | `.agents/skills/gaveta/` | `AGENTS.md` in the vault |
| **GitHub Copilot** | `.github/skills/gaveta/` | `.github/copilot-instructions.md` in the vault |

Use **both** for Cursor in a vault project: user skill for global behavior, vault rules so the agent always sees vault context.

## Install the skill

```bash
# One agent, user-wide (typical for Cursor / Claude Code)
gaveta skill install --target cursor --scope user --json

# Every supported agent in the current project
gaveta skill install --target all --scope project --json

# Preview paths without writing
gaveta skill install --target cursor --dry-run --json
```

The curl installer runs **`skill install --scope user`** automatically when **`~/.cursor`** and/or **`~/.claude`** exists. Pass **`--no-skill`** to skip.

### Check for updates

```bash
gaveta skill status --json
```

States: **missing**, **current**, **outdated**, **modified** (local edits — use **`--force`** to overwrite on install).

## Recommended workflow (agents)

1. **`gaveta search`** — avoid duplicate notes  
2. **`gaveta backlinks`** and **`gaveta graph --depth 1`** — read context  
3. **`gaveta new`** or **`gaveta edit --from -`** — pass HTML on stdin for large bodies  
4. Link with **`[[Title]]`** (wikilinks)  
5. **`gaveta validate`** / **`gaveta doctor --json`** before finishing  

For Markdown corpora: **`gaveta import`** with **`--dry-run`** first. Contract details: **`gaveta guide`**, not copied into chat.

## Working outside the vault directory

Set the vault explicitly:

```bash
export GAVETA_VAULT=/path/to/vault
# or
gaveta --vault /path/to/vault new "Title" --type doc --from - --json
```

The skill documents **`gaveta doctor --json`** to confirm the active vault.

## MCP alternative

Agents with MCP can use **`gaveta mcp`** instead of shelling the CLI. See **[MCP](mcp.md)**. The CLI remains the reference implementation.

## Repository copy

The canonical generated tree is **`skills/gaveta/`** in the repo (used by tests). Installed copies should come from **`gaveta skill install`**, not by copying the repo path manually (unless you are developing the skill itself).
