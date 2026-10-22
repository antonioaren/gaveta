# Agent learnings

Short log of pitfalls found while implementing tasks. Read this before starting a task. Append one line when you hit something the next agent would otherwise repeat. Do not delete earlier lines.

Format: `YYYY-MM-DD · T<id> · what went wrong · how it was fixed`

- 2026-10-22 · T0.3 · The VM snapshot can lag `origin/main` (T0.2 was already merged). · `git fetch origin main` before treating a merged task as missing.
- 2026-10-22 · T1.1 · h4–h6 are allowed "con aviso" but the catalog has no `W_*` for them. · Set `headingWarning` on the element and do not invent a code.
- 2026-10-22 · T1.1 · `packages/core` sets `types: []`, and the root tsconfig omits `noUncheckedIndexedAccess`. · Keep core tests free of `node:fs`; a `!== undefined` guard that core needs fails `no-unnecessary-condition` under `tests/`.
- 2026-10-22 · T1.6 · `types: []` types `node:fs` as an error, including in a package that only imports `@gaveta/core` (server). · Set `compilerOptions.types` to `["node"]` and depend on `@types/node` in core and in those packages, matching the CLI.
- 2026-10-22 · T1.6 · `path.normalize` collapses `..` before symlink resolution, so `link/../x` looks inside when `link` points outside; macOS `/tmp` is itself a symlink, so rejecting every not-yet-inside symlink target false-rejects absolute paths. · Walk one segment at a time and reject an escaping symlink or `..` only after the walk has entered the vault.
- 2026-10-22 · T0.4 · Vitest's include list does not cover `fixtures/`, so tests in that package never run under `pnpm test`. · Add `fixtures/src/**/*.test.ts` to `vitest.config.ts`.
- 2026-10-22 · T0.4 · Prettier printWidth 100 wraps `[[Title with spaces]]` onto the next line and splits the wikilink. · Put each wikilink in its own short paragraph.
- 2026-10-22 · T0.4 · Prettier puts the closing `>` of a long `</a>` on the next line, so a `</a>` regex misses the anchor. · Match `</a\s*>` when reading fixture HTML.
- 2026-10-22 · T0.4 · CodeQL treats fixture HTML as library input: `.replace(/<[^>]+>/g)` is incomplete sanitization, and `/\[\[[^\]\r\n]+\]\]/g` is polynomial ReDoS. · Scan for tags and `[[…]]` with `indexOf` instead of those regexes.
- 2026-10-22 · T1.2 · parse5 defaults `scriptingEnabled` to true (a script inside `<noscript>` stays text) and a leading U+FEFF is reported as `missing-doctype`. · Parse with `scriptingEnabled: false` and strip one leading BOM.
- 2026-10-22 · T1.13 · Commander consumes the next token as the value of `--from`, so `--from --json` stores `"--json"` and never sets the flag (`--from -` itself does work). The bin imports `.ts` with no emit. · Reject a `--from` value that starts with `-` other than exactly `-`. Re-exec with `--experimental-strip-types` only when `process.features.typescript` is off; Node 22.18+ strips types by default and e2e that spawn `node bin/gaveta.js` never see the shebang.
