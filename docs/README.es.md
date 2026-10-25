# Gaveta — documentación en español

Índice breve de la documentación del repositorio. El [README](../README.md) principal incluye una guía rápida en inglés para MCP.

## MCP (Claude Code)

`gaveta mcp` arranca un servidor [Model Context Protocol](https://modelcontextprotocol.io) por stdio. Cada comando de la CLI (salvo `mcp` y el bloqueante `serve`) es una herramienta MCP. Las respuestas usan el mismo sobre JSON que `gaveta … --json` (`ok`, `data`, `warnings`, códigos estables `E_*` / `W_*`). Indica `vault` en los argumentos de la herramienta o define `GAVETA_VAULT`; `lang` (`en` / `es`) equivale a `--lang`.

Registro en Claude Code (con `gaveta` en el `PATH`):

```bash
claude mcp add gaveta -- gaveta mcp
```

Los registros y avisos van a stderr; stdout queda reservado al protocolo MCP.

## Más documentación

- [PRD](PRD.md)
- [Requisitos](REQUIREMENTS.md)
- [Tareas](TASKS.md)
- [AGENTS.md](../AGENTS.md)
