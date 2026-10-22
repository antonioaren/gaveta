---
name: gaveta
description: 'Documenta un vault de Gaveta con la CLI: buscar, leer contexto, escribir notas HTML enlazadas y validar. Remite a gaveta guide para el contrato.'
gaveta-cli-version: 0.0.0
---

# Gaveta

Gaveta es una base de conocimiento local: cada nota es un archivo HTML y los enlaces entre notas son el producto. Los agentes escriben solo con la CLI (`gaveta` o `gv`); no edites el vault a mano ni inventes elementos HTML fuera del contrato.

## Cuándo usar esta skill

- El usuario pide documentar, enlazar o mantener notas en un vault de Gaveta.
- Necesitas crear o actualizar conocimiento persistente que otras notas puedan enlazar.
- Debes comprobar enlaces, tareas o la salud del vault antes o después de escribir.

## Flujo recomendado

- Busca antes de crear (`gaveta search`).
- Lee el contexto con `gaveta backlinks` y `gaveta graph --depth 1`.
- Escribe con `gaveta new` o `gaveta edit --from -` y enlaza con `[[Título]]`.
- Comprueba con `gaveta validate` antes de dar por cerrado un lote de cambios.
- Usa `--json` y `--if-match` al escribir.
- El contrato completo está en `gaveta guide`. No lo copies en las notas ni en el chat.

Detalle paso a paso: [`references/flujo.md`](references/flujo.md).

## Salida JSON y escrituras seguras

- Añade `--json` a los comandos para un sobre estable con `ok`, `data` y avisos.
- Tras `gaveta read` o una escritura, conserva el hash `sha256:…` y pásalo con `--if-match` en `new` o `edit` para no pisar cambios ajenos.
- Pasa HTML largo con `--from -` (stdin) en `new` y `edit`.

## Vault y directorio de trabajo

- Si no estás dentro del vault, pasa `--vault <ruta>` o define `GAVETA_VAULT`.
- Comprueba el vault activo con `gaveta doctor --json` (ruta, índice y enlaces rotos).

## Tipos de nota

Valores de `gaveta:type`: doc, slides, todo, dashboard, design, artifact. Resumen y fragmentos: [references/tipos-de-nota.md](references/tipos-de-nota.md).

## Contrato de autoría

No copies tablas de elementos ni listas de componentes en el chat. Ejecuta `gaveta guide` (o `gaveta guide --topic comandos` / `--topic errores`) para la referencia actualizada.
