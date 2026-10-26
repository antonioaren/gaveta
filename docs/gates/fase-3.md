# Phase 3 gate — Manual checklist (T3.9)

Use this file together with the automated round-trip suite (`pnpm gate:3` or `./scripts/gate-3.sh`). Pedro records manual outcomes in **Results** below.

---

## English — What to verify

### Before you start

- [ ] Node **≥ 22.18**, `pnpm install`, `pnpm build:web`.
- [ ] Run `./scripts/gate-3.sh` (or `pnpm gate:3`). **Expected:** all automated fixture round-trips pass.
- [ ] Start a demo vault, e.g. `pnpm demo` or import `fixtures/showcase` + `gaveta serve` with a token URL.

### Visual editor

- [ ] Open a **doc** note, edit title/body, save. **Expected:** changes persist; reload shows the same content.
- [ ] Open a **todo** note, toggle tasks and edit text, save.
- [ ] Open **slides**, edit slide headings/body, save.

### Code mode

- [ ] Switch to code mode on a doc note, edit HTML, save (`Mod+S`). **Expected:** valid HTML is accepted; invalid markup shows an error without corrupting the file.
- [ ] Emmet / HTML completion still works for allowed tags.

### Command palette & Format document

- [ ] Open the command palette; run **Format document** on a messy note. **Expected:** canonical Gaveta HTML without unsafe content.

### Wikilink autocomplete

- [ ] In visual mode, type `[[` and pick an existing note from suggestions. **Expected:** inserted link uses `data-g-to` (resolved) or pending ghost as designed.

### External change & merge view

- [ ] Edit a note in the app; change the same file on disk; **Expected:** banner + merge view; merge or reload resolves without silent data loss.

### Open in VS Code

- [ ] From code mode, **Open in VS Code** opens `vscode://file/…` for the note path (no vault path leaked in the shell).

### PDF export (slides)

- [ ] Open a **slides** note in the render view; **Export PDF** triggers print layout (no network fetch).

### App / CLI parity

- [ ] Create/rename/move/delete a note via CLI and confirm the web app reflects it (live reload or refresh).
- [ ] Perform the same operations in the web UI and confirm `gaveta notes` / index stay consistent.

### Locales (en / es)

- [ ] Switch UI to **English**; spot-check shell, editor, and errors.
- [ ] Switch to **Spanish**; repeat. **Expected:** matching keys, stable error codes (`E_*` / `W_*` untranslated).

### Results (Pedro)

| Area | Pass? | Notes |
| --- | --- | --- |
| Visual editor | | |
| Code mode | | |
| Palette / Format | | |
| Wikilink autocomplete | | |
| External change / merge | | |
| Open in VS Code | | |
| PDF export | | |
| App / CLI parity | | |
| en / es | | |

---

## Español — Qué comprobar

### Antes de empezar

- [ ] Node **≥ 22.18**, `pnpm install`, `pnpm build:web`.
- [ ] Ejecutar `./scripts/gate-3.sh` (o `pnpm gate:3`). **Resultado esperado:** pasan todas las idas y vueltas automáticas sobre `fixtures/`.
- [ ] Arrancar un vault de prueba, p. ej. `pnpm demo` o importar `fixtures/showcase` + `gaveta serve` con URL y token.

### Editor visual

- [ ] Abrir una nota **doc**, editar título/cuerpo, guardar. **Resultado esperado:** persiste al recargar.
- [ ] Abrir una nota **todo**, marcar tareas y editar texto, guardar.
- [ ] Abrir **slides**, editar diapositivas, guardar.

### Modo código

- [ ] Pasar a modo código, editar HTML, guardar (`Mod+S`). **Resultado esperado:** HTML válido se guarda; inválido muestra error sin romper el archivo.
- [ ] Emmet / autocompletado HTML en elementos permitidos.

### Paleta y Formatear documento

- [ ] Abrir la paleta; **Formatear documento** en una nota desordenada. **Resultado esperado:** HTML canónico sin contenido inseguro.

### Autocompletado de wikienlaces

- [ ] En modo visual, escribir `[[` y elegir una nota. **Resultado esperado:** enlace con `data-g-to` o fantasma pendiente según corresponda.

### Cambio externo y vista de fusión

- [ ] Editar en la app; cambiar el mismo archivo en disco. **Resultado esperado:** aviso + vista de fusión; fusionar o recargar sin pérdida silenciosa.

### Abrir en VS Code

- [ ] Desde modo código, **Abrir en VS Code** abre `vscode://file/…` sin exponer rutas del vault en la shell.

### Exportar PDF (presentaciones)

- [ ] Nota **slides** en vista render; **Exportar PDF** usa impresión del navegador (sin red).

### Paridad app / CLI

- [ ] Crear/renombrar/mover/borrar por CLI y comprobar la web.
- [ ] Mismas operaciones en la web y comprobar CLI / índice.

### Idiomas (en / es)

- [ ] Interfaz en **inglés**; revisar shell, editor y errores.
- [ ] Interfaz en **español**; mismas comprobaciones. **Resultado esperado:** códigos `E_*` / `W_*` sin traducir.

### Resultados (Pedro)

| Área | ¿OK? | Notas |
| --- | --- | --- |
| Editor visual | | |
| Modo código | | |
| Paleta / Formatear | | |
| Autocompletado wikienlaces | | |
| Cambio externo / fusión | | |
| Abrir en VS Code | | |
| Exportar PDF | | |
| Paridad app / CLI | | |
| en / es | | |
