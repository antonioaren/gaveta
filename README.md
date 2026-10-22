# gaveta

Base de conocimiento local, al estilo Obsidian, donde cada nota es un archivo HTML y las conexiones entre notas son el centro del producto. Los agentes LLM (Claude Code, Codex o scripts) escriben en el vault a través de la CLI `gaveta`, y la app lo muestra y permite editarlo.

## Documentación

- [PRD](docs/PRD.md): qué es Gaveta y por qué.
- [Requisitos](docs/REQUIREMENTS.md): requisitos verificables, decisiones aprobadas y contratos de autoría y de la CLI.
- [Tareas](docs/TASKS.md): plan de ejecución por fases.

## Probar el MVP

Requisito: **Node.js ≥ 22.18** (coincide con `.nvmrc` y `engines` del monorepo). En macOS/Linux:

```bash
corepack enable
pnpm install
```

Ejecuta la CLI desde el repo sin instalarla:

```bash
pnpm exec gaveta init ./mi-vault --json
pnpm exec gaveta new ./mi-vault/nota.html --title "Hola" --json
pnpm exec gaveta read nota --json --vault ./mi-vault
pnpm exec gaveta edit nota --vault ./mi-vault --from - --json   # escribe en stdin
pnpm exec gaveta search hola --json --vault ./mi-vault
```

Para tener `gaveta` y `gv` en el PATH global:

```bash
cd packages/cli
pnpm link --global
```

Comprueba con `gaveta version`. No hace falta `NODE_NO_WARNINGS`.

## Desarrollo

Requisito: Node.js ≥ 22.18. pnpm 10 está fijado en `packageManager`.

```bash
pnpm install
pnpm check
pnpm dev
pnpm exec gaveta version
```

`pnpm check` ejecuta format, lint, typecheck, tests con cobertura, e2e y `pnpm audit --audit-level=high`. Es el mismo conjunto que la CI local. El flujo de trabajo de los agentes está en [AGENTS.md](AGENTS.md).

`gaveta` y `gv` son el mismo binario. `gaveta version` imprime la versión; `--json` escribe el sobre versionado, `--vault` localiza el vault y `--from` lee un archivo o stdin. El resto de comandos llega en la fase 1.

| Paquete          | Ruta              | Estado                            |
| ---------------- | ----------------- | --------------------------------- |
| `@gaveta/core`   | `packages/core`   | vacío hasta la fase 1             |
| `@gaveta/cli`    | `packages/cli`    | esqueleto (`version`, sobre JSON) |
| `@gaveta/server` | `packages/server` | vacío hasta la fase 2             |
| `@gaveta/web`    | `apps/web`        | esqueleto React + Vite            |

Los paquetes de Node usan TypeScript estricto con `NodeNext` y sin emit. Los imports relativos llevan extensión `.ts`. La app usa la resolución de Vite.
