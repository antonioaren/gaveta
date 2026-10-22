# gaveta

Base de conocimiento local, al estilo Obsidian, donde cada nota es un archivo HTML y las conexiones entre notas son el centro del producto. Los agentes LLM (Claude Code, Codex o scripts) escriben en el vault a través de la CLI `gaveta`, y la app lo muestra y permite editarlo.

## Documentación

- [PRD](docs/PRD.md): qué es Gaveta y por qué.
- [Requisitos](docs/REQUIREMENTS.md): requisitos verificables, decisiones propuestas y contratos de autoría y de la CLI.
- [Tareas](docs/TASKS.md): plan de ejecución por fases.

## Desarrollo

Requisito: Node.js ≥ 22. pnpm 10 está fijado en `packageManager`.

```bash
pnpm install
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test
pnpm dev
pnpm exec gaveta
```

`gaveta` y `gv` son el mismo binario. Todavía no tiene comandos: imprime la versión. El núcleo, la API y el visor llegan en las fases 1 y 2.

| Paquete          | Ruta              | Estado                 |
| ---------------- | ----------------- | ---------------------- |
| `@gaveta/core`   | `packages/core`   | vacío hasta la fase 1  |
| `@gaveta/cli`    | `packages/cli`    | binario sin comandos   |
| `@gaveta/server` | `packages/server` | vacío hasta la fase 2  |
| `@gaveta/web`    | `apps/web`        | esqueleto React + Vite |

Los paquetes de Node usan TypeScript estricto con `NodeNext` y sin emit. Los imports relativos llevan extensión `.ts`. La app usa la resolución de Vite.
