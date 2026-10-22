# Fixtures

Hand-written Gaveta vaults and a deterministic generator. Notes follow the HTML shape in `docs/PRD.md` and `docs/REQUIREMENTS.md` (`gaveta:*` meta, `data-g-to` ULIDs, `[[Title]]`, and ghost links). The core contract (T1.1) was not used to produce them.

**Re-validated in T1.3.** `validateNote` / `validateVault` accept the empty vault, the backlinks vault, and the seeded generator output with no errors. The problems vault fails on the invalid task and on the duplicate id. The malicious vault produces the codes in the table below. Shape tests in this package are not a substitute for that check.

`config.json` is provisional until T1.6. `theme.css` is a byte copy of the core default theme (`packages/core/src/theme/theme.css`), including a `prefers-color-scheme: dark` palette. The same two files are copied into every vault. There is no `index.sqlite`; the index is a cache.

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

Each file is still a full note (id, type, created, title, local theme). The payload is the point. Remote URLs use the reserved host `evil.example`. The codes are the set `validateNote` reports for that file (T1.3).

| File                  | Case                                                        | Codes                                                      |
| --------------------- | ----------------------------------------------------------- | ---------------------------------------------------------- |
| `script.html`         | Inline `<script>` and `<script src="https://…">`            | `E_UNSAFE_SCRIPT`, `W_REMOTE_RESOURCE`                     |
| `handler.html`        | `onerror`, `onclick`, `onload`, plus an `svg`               | `E_UNSAFE_HANDLER`, `E_HTML_INVALID`                       |
| `url-javascript.html` | `javascript:`, `JAVASCRIPT:`, and a leading space           | `E_UNSAFE_URL`                                             |
| `iframe.html`         | `<iframe>` to `https:` and `data:`                          | `E_UNSAFE_ELEMENT`, `W_REMOTE_RESOURCE`                    |
| `object.html`         | `<object>`                                                  | `E_UNSAFE_ELEMENT`, `W_REMOTE_RESOURCE`                    |
| `embed.html`          | `<embed>`                                                   | `E_UNSAFE_ELEMENT`, `W_REMOTE_RESOURCE`                    |
| `formulario.html`     | `<form action="https://…">` and a text input                | `E_UNSAFE_ELEMENT`, `E_HTML_INVALID`, `W_REMOTE_RESOURCE`  |
| `base.html`           | `<base href="https://…">`                                   | `E_UNSAFE_ELEMENT`, `W_REMOTE_RESOURCE`                    |
| `imagen-remota.html`  | `https`, `http`, protocol-relative, and `srcset`            | `E_HTML_INVALID`, `W_REMOTE_RESOURCE`                      |
| `hoja-remota.html`    | Remote stylesheet and a preload font                        | `E_HTML_INVALID`, `W_REMOTE_RESOURCE`                      |
| `path-traversal.html` | `../`, `/etc/passwd`, backslash, and `attachments/../../`   | `E_PATH_OUTSIDE_VAULT`                                     |
| `meta-refresh.html`   | `<meta http-equiv="refresh">` to a remote URL               | `E_HTML_INVALID`, `W_REMOTE_RESOURCE`                      |
| `estilo-inline.html`  | Inline style with a remote `url()` and `expression()`       | `W_INLINE_STYLE_REMOVED`, `W_REMOTE_RESOURCE`              |
| `combinada.html`      | `<script>`, `onerror`, and `<img src="https://…">` together | `E_UNSAFE_SCRIPT`, `E_UNSAFE_HANDLER`, `W_REMOTE_RESOURCE` |

`srcset` is outside the authoring contract, so the remote image is also `E_HTML_INVALID`. `svg`, the text input, `rel="preload"`, and `http-equiv="refresh"` are outside the shell too. CSS `expression()` is not executed; the inline style is `W_INLINE_STYLE_REMOVED` (the normalizer removes it in T1.4). A remote `https` URL on an anchor is a link, not `W_REMOTE_RESOURCE`.

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
