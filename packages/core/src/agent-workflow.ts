/**
 * Shared agent workflow bullets. Used by init agent blocks and the Gaveta skill
 * so both stay aligned with the CLI without copying the full contract.
 */
export const AGENT_WORKFLOW_BULLETS = [
  'Busca antes de crear (`gaveta search`).',
  'Lee el contexto con `gaveta backlinks` y `gaveta graph --depth 1`.',
  'Escribe con `gaveta new` o `gaveta edit --from -` y enlaza con `[[Título]]`.',
  'Para traer Markdown existente: `gaveta import <archivo.md|carpeta> --dry-run`, revisa el resumen y luego importa sin `--dry-run` (usa `--in` si hace falta).',
  'Para sacar notas a Markdown: `gaveta export <ref|--all> --to md --out <dir>` (prueba `--dry-run` antes).',
  'Comprueba con `gaveta validate` antes de dar por cerrado un lote de cambios.',
  'Usa `--json` y `--if-match` al escribir.',
  'El contrato completo está en `gaveta guide`. No lo copies en las notas ni en el chat.',
] as const;

export const AGENT_VAULT_BULLETS = [
  'Si no estás dentro del vault, pasa `--vault <ruta>` o define `GAVETA_VAULT`.',
  'Comprueba el vault activo con `gaveta doctor --json` (ruta, índice y enlaces rotos).',
] as const;
