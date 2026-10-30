# CLI reference

The full, up-to-date reference is generated from the command registry:

```bash
gaveta guide
gaveta guide --topic comandos --json
gaveta guide --topic errores --json
```

This page is a stable index. Every command supports **`--json`** (versioned envelope with **`ok`**, **`data`**, **`warnings`**, stable **`E_*`** / **`W_*`** codes) unless noted.

Global flags (all commands): **`--vault`**, **`--lang en|es`**, **`--strict-rel`**, **`--from`**, **`--json`**.

## Meta

| Command | Summary |
| --- | --- |
| **`version`** | SemVer, git commit, Node version, install method |
| **`update`** | Git fast-forward, deps, web build, vault asset upgrade |
| **`guide`** | Contract + command examples |

## Vault

| Command | Summary |
| --- | --- |
| **`init [dir]`** | Create or complete a vault; optional **`--agent-instructions`** |
| **`adopt <file>`** | Promote external HTML (e.g. Claude artifacts) into the vault |
| **`reindex`** | Rebuild SQLite index |

## Notes

| Command | Summary |
| --- | --- |
| **`new <title>`** | Create note; **`--type`**, **`--from -`**, **`--if-match`** |
| **`read <ref>`** | **`--as html|text|outline`**; returns content hash for writes |
| **`edit <ref>`** | Section edits, append/replace; **`--if-match`** |
| **`validate [ref]`** | One note, **`--all`**, or stdin HTML |

## Links and graph

| Command | Summary |
| --- | --- |
| **`links`**, **`backlinks`**, **`mentions`** | Outgoing / incoming / unlinked mentions |
| **`link`** | Idempotent link insertion |
| **`graph`** | Global or local graph; **`--depth`**, filters |

## Organization

| Command | Summary |
| --- | --- |
| **`mv`**, **`rm`** | Move/remove notes; rewrite incoming links |
| **`mkdir`**, **`mv-folder`**, **`rm-folder`** | Folder operations |
| **`meta`** | Tags, aliases, type metadata |

## Tasks and search

| Command | Summary |
| --- | --- |
| **`todo`** | **`add`**, **`check`**, **`uncheck`**, **`list`** |
| **`search <query>`** | FTS5 with snippets |
| **`stats`** | Vault statistics |

## Quality

| Command | Summary |
| --- | --- |
| **`doctor`** | Broken/pending links, orphans; **`--fix`** |
| **`validate --all`** | Validate every note |

## Migration

| Command | Summary |
| --- | --- |
| **`import`** | Markdown → HTML notes; **`--dry-run`** |
| **`export`** | Notes → Markdown; **`--to md`**, **`--out`** |

## Agents

| Command | Summary |
| --- | --- |
| **`skill install`**, **`skill status`** | Agent Skills bundle |
| **`guide`** | Contract and examples |

## Runtime

| Command | Summary |
| --- | --- |
| **`serve`** | Local API + web viewer on **127.0.0.1**; long-running |
| **`mcp`** | MCP server on stdio |

## Aliases

**`gv`** is the same binary as **`gaveta`**.

See also **[Configuration](configuration.md)** and **[Quick start](quick-start.md)**.
