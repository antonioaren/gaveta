# CI e2e speed (macOS job timeout)

**Task:** CI health — redundant `build:web` in Playwright e2e (PR #96).

## Pitfall

macOS `e2e` jobs hit the 15-minute limit while tests were still passing. Vitest runs serially (`fileParallelism: false`) and ~20 Playwright files each ran `pnpm build:web` in `beforeAll` on top of the workflow’s own `pnpm build:web`.

Skipping `build:web` whenever `apps/web/dist/index.html` exists is unsafe locally: stale dist makes `pnpm test:e2e` pass against an old UI.

## Fix

- `e2e/global-setup.ts` → `prepareWebDistForE2eRun()` always runs `pnpm build:web` once per e2e run locally; writes `node_modules/.cache/gaveta-e2e-web-built.stamp` so worker `ensureWebBuilt()` calls stay no-ops.
- CI sets `GAVETA_E2E_WEB_PREBUILT=1` on the `pnpm test:e2e` step after `pnpm build:web`; globalSetup and `ensureWebBuilt()` skip building.
- Per-file `beforeAll` still calls `ensureWebBuilt()` only to guard ordering; it does not rebuild each file.

## Measured (ubuntu VM, `build:web` + `test:e2e`)

| | Wall | Extra `@gaveta/web` builds in suite |
| --- | --- | --- |
| Before (per-file builds) | ~539 s | 20 |
| After (deduped) | ~443 s | 0 |

CI on this PR: `e2e_duration_seconds` ~640 s on macOS (was cancelled above 900 s before).
