# Gaveta

Base de conocimiento local, al estilo Obsidian, donde cada nota es un archivo HTML y las conexiones entre notas son el centro del producto. Los agentes LLM (Claude Code, Codex o scripts) escriben en el vault a través de la CLI `gaveta`, y la app lo muestra y permite editarlo.

## Documentación

- [PRD](PRD.md): qué es Gaveta y por qué.
- [Requisitos](REQUIREMENTS.md): requisitos verificables, decisiones aprobadas y contratos de autoría y de la CLI.
- [Tareas](TASKS.md): plan de ejecución por fases.

## Probar el MVP

Requisito: **Node.js ≥ 22.18** (coincide con `.nvmrc` y `engines` del monorepo). En macOS/Linux:

```bash
corepack enable
pnpm install
```

Ejecuta la CLI desde el repo sin instalarla (el título va como argumento; el HTML del cuerpo, con `--from -`):

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

# macOS: abre la nota en el navegador (file://)
open mi-vault/origen.html
```

Para instalar desde un checkout de git (recomendado hoy) y dejar `gaveta` y `gv` en `~/.local/bin`:

```bash
git clone https://github.com/antonioaren/gaveta.git
cd gaveta
corepack enable
pnpm install
mkdir -p ~/.local/bin
ln -sf "$(pwd)/packages/cli/bin/gaveta.js" ~/.local/bin/gaveta
ln -sf "$(pwd)/packages/cli/bin/gaveta.js" ~/.local/bin/gv
```

Comprueba con `gaveta version` (muestra versión SemVer, commit git, Node y método de instalación). No hace falta `NODE_NO_WARNINGS`.

### Actualizar

En un checkout de git en la rama `main`, sin cambios locales sin confirmar:

```bash
gaveta update
```

Solo comprobar si hay actualización (`0` = al día, `1` = disponible):

```bash
gaveta update --check
```

Por defecto sigue el último tag `v*` (`--channel stable`); usa `--channel main` para seguir `origin/main`. Si la instalación no es un checkout de git, el comando muestra los pasos manuales. Tras actualizar, refresca los assets de `.gaveta/` del vault actual (o del indicado con `--vault`) sin tocar las notas. Ver [releasing.md](releasing.md) para publicar versiones.

## Desarrollo

Requisito: Node.js ≥ 22.18. pnpm 10 está fijado en `packageManager`.

```bash
pnpm install
pnpm check
pnpm dev
pnpm exec gaveta version
```

`pnpm check` ejecuta format, lint, typecheck, tests con cobertura, e2e y `pnpm audit --audit-level=high`. Es el mismo conjunto que la CI local. El flujo de trabajo de los agentes está en [AGENTS.md](../AGENTS.md).

`gaveta` y `gv` son el mismo binario. `gaveta version` y `gaveta update` gestionan la versión instalada; `--json` escribe el sobre versionado, `--vault` localiza el vault y `--from` lee un archivo o stdin.

### Importar desde Claude

Convierte HTML generado por Claude (documentos, diapositivas, paneles o artefactos React) en notas Gaveta:

```bash
pnpm exec gaveta init mi-vault --json

cp fixtures/claude/doc.html mi-vault/informe.html
pnpm exec gaveta adopt informe.html --vault mi-vault --source claude --json

cp fixtures/claude/react-app.html mi-vault/demo.html
pnpm exec gaveta adopt demo.html --vault mi-vault --source claude --allow-cdn --json

cat fixtures/claude/doc.html \
  | pnpm exec gaveta new "Informe" --vault mi-vault --type doc --source claude --from - --json
```

Los scripts y estilos inline se eliminan en tipos declarativos (`doc`, `slides`, `dashboard`, `design`); el HTML interactivo se guarda como nota `artifact` dentro de un `iframe` aislado.

| Paquete          | Ruta              | Rol                                        |
| ---------------- | ----------------- | ------------------------------------------ |
| `@gaveta/core`   | `packages/core`   | contrato, parser, vault, índice, operaciones |
| `@gaveta/cli`    | `packages/cli`    | binario `gaveta` / `gv`                    |
| `@gaveta/server` | `packages/server` | API local (`gaveta serve`)                 |
| `@gaveta/web`    | `apps/web`        | visor y editor React + Vite                |

Los paquetes de Node usan TypeScript estricto con `NodeNext` y sin emit. Los imports relativos llevan extensión `.ts`. La app usa la resolución de Vite.

## MCP (Claude Code)

`gaveta mcp` arranca un servidor [Model Context Protocol](https://modelcontextprotocol.io) por stdio. Cada comando de la CLI (salvo `mcp` y el bloqueante `serve`) es una herramienta MCP. Las respuestas usan el mismo sobre JSON que `gaveta … --json` (`ok`, `data`, `warnings`, códigos estables `E_*` / `W_*`). Indica `vault` en los argumentos de la herramienta o define `GAVETA_VAULT`; `lang` (`en` / `es`) equivale a `--lang`.

Registro en Claude Code (con `gaveta` en el `PATH`):

```bash
claude mcp add gaveta -- gaveta mcp
```

Los registros y avisos van a stderr; stdout queda reservado al protocolo MCP.

## Licencia

Este proyecto está bajo la licencia MIT. Consulta el archivo [LICENSE](../LICENSE) para el texto completo.
