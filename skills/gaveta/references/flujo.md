# Flujo de trabajo con Gaveta

Usa este orden al documentar con la CLI. El contrato HTML (elementos, componentes y tipos) vive en `gaveta guide`; aquí solo el flujo.

## Pasos

1. Busca antes de crear (`gaveta search`).
2. Lee el contexto con `gaveta backlinks` y `gaveta graph --depth 1`.
3. Escribe con `gaveta new` o `gaveta edit --from -` y enlaza con `[[Título]]`.
4. Comprueba con `gaveta validate` antes de dar por cerrado un lote de cambios.
5. Usa `--json` y `--if-match` al escribir.
6. El contrato completo está en `gaveta guide`. No lo copies en las notas ni en el chat.

## Vault fuera del directorio actual

- Si no estás dentro del vault, pasa `--vault <ruta>` o define `GAVETA_VAULT`.
- Comprueba el vault activo con `gaveta doctor --json` (ruta, índice y enlaces rotos).

## Comandos de referencia (ejemplos reales)

### search

Busca texto en el título, los alias, los encabezados y el cuerpo.
`gaveta search "base de datos" --json`

### new

Crea una nota, completa los metadatos y resuelve los enlaces [[…]].
`gaveta new "Usar SQLite" --type doc --in decisiones --from -`

### edit

Sustituye, añade o antepone contenido en una sección o en el artículo.
`gaveta edit "Usar SQLite" --section resumen --replace --from -`

### read

Lee una nota como html, text u outline y devuelve su hash.
`gaveta read "Usar SQLite" --as outline`

### backlinks

Lista los enlaces entrantes con el contexto donde aparecen.
`gaveta backlinks "Usar SQLite" --json`

### graph

Muestra el grafo global o local de notas y enlaces.
`gaveta graph --json`

### validate

Valida una nota, el vault entero o HTML de stdin sin escribir.
`gaveta validate nota.html --json`

### doctor

Revisa enlaces rotos, pendientes, huérfanas, ids duplicados y notas inválidas.
`gaveta doctor --json`

### guide

Imprime el contrato de autoría, los comandos y el catálogo de errores.
`gaveta guide --topic tipos`
