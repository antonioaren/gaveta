# Agent learnings

Short log of pitfalls found while implementing tasks. Read this before starting a task. Append one line when you hit something the next agent would otherwise repeat. Do not delete earlier lines.

Format: `YYYY-MM-DD · T<id> · what went wrong · how it was fixed`

- 2026-10-22 · T0.3 · The VM snapshot can lag `origin/main` (T0.2 was already merged). · `git fetch origin main` before treating a merged task as missing.
- 2026-10-22 · T1.1 · h4–h6 are allowed "con aviso" but the catalog has no `W_*` for them. · Set `headingWarning` on the element and do not invent a code.
- 2026-10-22 · T1.1 · `packages/core` sets `types: []`, and the root tsconfig omits `noUncheckedIndexedAccess`. · Keep core tests free of `node:fs`; a `!== undefined` guard that core needs fails `no-unnecessary-condition` under `tests/`.
- 2026-10-22 · T1.6 · `types: []` types `node:fs` as an error, including in a package that only imports `@gaveta/core` (server). · Set `compilerOptions.types` to `["node"]` and depend on `@types/node` in core and in those packages, matching the CLI.
- 2026-10-22 · T1.6 · `path.normalize` collapses `..` before symlink resolution, so `link/../x` looks inside when `link` points outside; macOS `/tmp` is itself a symlink, so rejecting every not-yet-inside symlink target false-rejects absolute paths. · Walk one segment at a time and reject an escaping symlink or `..` only after the walk has entered the vault.
