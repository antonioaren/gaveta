# Fixtures

Hand-written Gaveta vaults and a deterministic generator. Notes follow the HTML shape in `docs/PRD.md` and `docs/REQUIREMENTS.md` (`gaveta:*` meta, `data-g-to` ULIDs, `[[Title]]`, and ghost links). The core contract (T1.1) was not used to produce them.

**Re-validate these fixtures once the T1.3 validator lands.** Until then, the tests in this package only check the shape described here. They are not proof that `gaveta validate` accepts a note.

`config.json` is provisional until T1.6. `theme.css` is a placeholder until T1.5 (dark text `#1a1a1a` on `#ffffff` so a note opened with `file://` is not unstyled). The same two files are copied into every vault. There is no `index.sqlite`; the index is a cache.

Filenames use the 2026-10-22 slug rule: lowercase, strip accents, map every other character to a hyphen. Directory names (`enlaces/`, `dup/`, `anidada/`, `notes/`) are layout, not part of the slug.

## `vaults/empty`

A vault with `.gaveta/` and no notes. Use it for init idempotence and for "zero notes" cases.

## `vaults/backlinks` (REQ-LINK-09)

`nota-x.html` is **Nota X** (alias `Nota equis`). Exactly 20 notes link to it with a canonical `<a href data-g-to rel>`:

- `enlaces/enlace-01.html` … `enlace-10.html` use `../nota-x.html` (one directory deep).
- `enlaces/mas/enlace-11.html` … `enlace-20.html` use `../../nota-x.html` (two directories deep).

`rel` cycles through `related`, `depends-on`, `part-of`, `supersedes`, `references`. Enlace 19 is a `slides` note. Enlace 20 is a `todo` note with one open task and one checked task. The other linkers are `doc` notes. No other file points at Nota X.

`formas-de-enlace.html` is not one of the 20. It shows the other link forms, aimed at **Destino enlace** (which has a section `resumen`), each wikilink in its own short paragraph so Prettier does not split it:

- canonical `data-g-to`
- `[[Destino enlace]]`
- `[[Destino enlace|texto visible]]`
- `[[Destino enlace#resumen]]`
- ghost `<a data-g-pending="Nota fantasma">`

Nota X also carries the P0 components: callout (`info` and `warn`), table, figure, and a `language-html` code block. The figure uses the local file `attachments/pixel.png`.

## `vaults/problems` (REQ-LINK-11)

One finding of each kind `gaveta doctor` reports, plus the two repairs `--fix` performs. A pending link counts as outgoing, so the pending note is not also the orphan.

| File                                                 | Finding                                                                                                                 |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `nota-rota.html`                                     | Broken link: `data-g-to` is a ULID that no note uses (`href="no-existe.html"`).                                         |
| `nota-pendiente.html`                                | One ghost link: `data-g-pending="Nota fantasma"`.                                                                       |
| `nota-huerfana.html`                                 | Orphan: no incoming `data-g-to` and no outgoing anchor or wikilink.                                                     |
| `dup/duplicado-alfa.html`, `dup/duplicado-beta.html` | Same `gaveta:id`, different paths. Both link to Nota destino, so neither is an orphan.                                  |
| `nota-invalida.html`                                 | Invalid note: `todo` whose `data-g-due` is `not-a-date`. It still links to Nota destino.                                |
| `href-desfasado.html`                                | `--fix` specimen: `data-g-to` is Nota destino, but `href` is `ruta-incorrecta.html`. Not a broken link.                 |
| `anidada/ruta-del-tema.html`                         | `--fix` specimen: theme href is `.gaveta/theme.css` instead of `../.gaveta/theme.css`. The note link itself is correct. |
| `nota-sana.html`, `nota-destino.html`                | Healthy pair, so the vault is not only problems.                                                                        |

This vault has no `[[…]]` wikilinks. Those live in the backlinks vault, so a wikilink scan cannot inflate the pending count here.

## `vaults/malicious` (REQ-SEC-01, REQ-SEC-02)

Each file is still a full note (id, type, created, title, local theme). The payload is the point. Remote URLs use the reserved host `evil.example`. Expected codes are the CLI contract names; T1.3 has not confirmed them yet.

| File                  | Case                                                        | Codes to expect                                        |
| --------------------- | ----------------------------------------------------------- | ------------------------------------------------------ |
| `script.html`         | Inline `<script>` and `<script src="https://…">`            | `E_UNSAFE_SCRIPT`                                      |
| `handler.html`        | `onerror`, `onclick`, `onload`                              | `E_UNSAFE_HANDLER`                                     |
| `url-javascript.html` | `javascript:`, `JAVASCRIPT:`, and a leading space           | `E_UNSAFE_URL`                                         |
| `iframe.html`         | `<iframe>` to `https:` and `data:`                          | `E_UNSAFE_ELEMENT`                                     |
| `object.html`         | `<object>`                                                  | `E_UNSAFE_ELEMENT`                                     |
| `embed.html`          | `<embed>`                                                   | `E_UNSAFE_ELEMENT`                                     |
| `formulario.html`     | `<form action="https://…">`                                 | `E_UNSAFE_ELEMENT`                                     |
| `base.html`           | `<base href="https://…">`                                   | `E_UNSAFE_ELEMENT`                                     |
| `imagen-remota.html`  | `https`, `http`, protocol-relative, and `srcset`            | `W_REMOTE_RESOURCE`                                    |
| `hoja-remota.html`    | Remote stylesheet and font                                  | `W_REMOTE_RESOURCE`                                    |
| `path-traversal.html` | `../`, `/etc/passwd`, backslash, and `attachments/../../`   | Path escape (same class as REQ-SEC-05). Not a symlink. |
| `meta-refresh.html`   | `<meta http-equiv="refresh">`                               | Unclassified until T1.3.                               |
| `estilo-inline.html`  | Inline style with a remote `url()` and `expression()`       | `W_INLINE_STYLE_REMOVED`, `W_REMOTE_RESOURCE`          |
| `combinada.html`      | `<script>`, `onerror`, and `<img src="https://…">` together | The REQ-SEC-01 specimen.                               |

## Generator (REQ-NFR-01, REQ-NFR-02, REQ-NFR-03, REQ-NFR-04)

`generateVault({ noteCount: 1000 | 5000, seed })` returns the file list. `writeVault(dir, files)` writes it and refuses `..`, absolute paths, and symlinks that would leave `dir`.

Output depends only on `noteCount`, `seed`, and the bytes of `vaults/empty/.gaveta/`. Do not commit the generated trees. Canonical seed is `1`. Note index `42` (`notes/00/nota-0042.html`) is the only note whose body contains `sqlite`. Every generated note is a valid `doc` with two canonical links (next note, and the note ten ahead, wrapping). Ids are Crockford ULIDs. There are no ghost links and no `[[…]]` in the generated vaults.

```ts
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateVault, writeVault, NFR_SEED } from '@gaveta/fixtures';

const files = generateVault({ noteCount: 1000, seed: NFR_SEED });
writeVault(mkdtempSync(join(tmpdir(), 'gaveta-nfr-')), files);
```
