# Flujo de trabajo con Gaveta

Usa este orden al documentar con la CLI. El contrato HTML (elementos, componentes y tipos) vive en `gaveta guide`; aquí solo el flujo.

## Pasos

1. Busca antes de crear (`gaveta search`).
2. Lee el contexto con `gaveta backlinks` y `gaveta graph --depth 1`.
3. Escribe con `gaveta new` o `gaveta edit --from -` y enlaza con `[[Título]]`.
4. Para traer Markdown existente: `gaveta import <archivo.md|carpeta> --dry-run`, revisa el resumen y luego importa sin `--dry-run` (usa `--in` si hace falta).
5. Para sacar notas a Markdown: `gaveta export <ref|--all> --to md --out <dir>` (prueba `--dry-run` antes).
6. Comprueba con `gaveta validate` antes de dar por cerrado un lote de cambios.
7. Usa `--json` y `--if-match` al escribir.
8. El contrato completo está en `gaveta guide`. No lo copies en las notas ni en el chat.

## Vault fuera del directorio actual

- Si no estás dentro del vault, pasa `--vault <ruta>` o define `GAVETA_VAULT`.
- Comprueba el vault activo con `gaveta doctor --json` (ruta, índice y enlaces rotos).

## Comandos de referencia (ejemplos reales)

### search

cli.auto.busca_texto_en_el_titulo_los_alias_los_encabezad
`gaveta search "base de datos" --json`

### import

cli.auto.importa_markdown_desde_un_archivo_o_una_carpeta_
`gaveta import ./docs --in proyectos --dry-run --on-conflict skip --continue-on-error --json`

### export

cli.auto.exporta_notas_del_vault_a_markdown
`gaveta export --all --to md --out ./export-md --links wiki --dry-run --json`

### new

cli.auto.crea_una_nota_completa_los_metadatos_y_resuelve_
`gaveta new "Usar SQLite" --type doc --in decisiones --from -`

### edit

cli.auto.sustituye_anade_o_antepone_contenido_en_una_secc
`gaveta edit "Usar SQLite" --section resumen --replace --from -`

### read

cli.auto.lee_una_nota_como_html_text_u_outline_y_devuelve
`gaveta read "Usar SQLite" --as outline`

### backlinks

cli.auto.lista_los_enlaces_entrantes_con_el_contexto_dond
`gaveta backlinks "Usar SQLite" --json`

### graph

cli.auto.muestra_el_grafo_global_o_local_de_notas_y_enlac
`gaveta graph --json`

### validate

cli.auto.valida_una_nota_el_vault_entero_o_html_de_stdin_
`gaveta validate nota.html --json`

### doctor

cli.auto.revisa_enlaces_rotos_pendientes_huerfanas_ids_du
`gaveta doctor --json`

### guide

cli.auto.imprime_el_contrato_de_autoria_los_comandos_y_el
`gaveta guide --topic tipos`
