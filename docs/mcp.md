# MCP (Model Context Protocol)

**`gaveta mcp`** runs an MCP server on **stdio**. Each CLI command (except **`mcp`** itself and long-running **`serve`**) is exposed as a tool. Tool results use the same versioned JSON envelope as **`gaveta … --json`**.

## Register with Claude Code

When **`gaveta`** is on your **`PATH`**:

```bash
claude mcp add gaveta -- gaveta mcp
```

Pass **`vault`** in tool arguments or set **`GAVETA_VAULT`**. Use **`lang`** (`en` / `es`) like **`--lang`**.

## Streams

- **stdout** — MCP protocol only  
- **stderr** — logs and diagnostics  

## CLI parity

Prefer MCP when the agent host supports it; otherwise shell the same commands documented in **`gaveta guide`**. See **[Agent skill](skill.md)**.
