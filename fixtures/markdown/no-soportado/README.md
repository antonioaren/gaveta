# Casos no soportados (T2.12)

Notas en esta carpeta documentan comportamiento esperado del importador **fuera** del subconjunto ida y vuelta (REQ-MIG-11). No deben romper la importación del resto del vault cuando se usa `--continue-on-error`; con importación estricta pueden producir avisos o degradación.

| Archivo            | Contenido                                | Comportamiento esperado (T2.13+)                                                                                                    |
| ------------------ | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `embed-nota.md`    | `![[otra-nota.md]]` embebiendo otra nota | No convertir a HTML canónico como enlace; conservar como texto, `W_IMPORT_LOSSY` o bloque HTML embebido según diseño del conversor. |
| `dataview.md`      | Bloque ` ```dataview `                   | Ignorar o tratar como bloque de código sin ejecutar; nunca ejecutar consultas.                                                      |
| `bloques-html.md`  | HTML crudo (`<div>`, `<span>`)           | Pasar por sanitización del núcleo; elementos no permitidos → error o aviso (`E_HTML_INVALID` / pérdida documentada).                |
| `notas-al-pie.md`  | Referencias `[^1]` y definiciones al pie | Si GFM footnotes no están en el subconjunto soportado, degradar con aviso; no inventar anclas canónicas.                            |
| `enlace-remoto.md` | Imagen `https://`                        | Seguir política DEC-05 / `remoteAllowlist`; típicamente `W_REMOTE_RESOURCE` sin copiar el archivo.                                  |

Enlaces rotos **intencionados** en el resto del vault (no en esta carpeta) están listados en `manifest.json` → `intentionalBrokenLinks`.
