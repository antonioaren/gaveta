# Gaveta agent guide

Gaveta is a local knowledge base. Each note is an HTML file in a vault, links between notes are the product, and there is no built-in LLM. Agents write through the `gaveta` CLI (alias `gv`). The web app reads and, later, edits through the same core. Product detail lives in `docs/PRD.md`, verifiable requirements in `docs/REQUIREMENTS.md`, and the execution plan in `docs/TASKS.md`.

## Repository map

```
gaveta/
├── packages/core/     # shared contract, parser, vault, index, operations
├── packages/cli/      # gaveta / gv binary
├── packages/server/   # local API (phase 2)
├── apps/web/          # React + Vite viewer and editor
├── skills/gaveta/     # agent skill (phase 1)
├── fixtures/          # vaults used by CLI e2e tests (phase 0, T0.4)
├── e2e/               # CLI e2e: spawn the binary
├── tests/             # repo-level contract tests (CI and harness)
└── docs/              # PRD, requirements, tasks, agent learnings
```

Packages are TypeScript, pnpm workspaces, and (for Node packages) `NodeNext` with relative `.ts` imports. Nothing is emitted. `@gaveta/core` is the only writer of vault rules; the CLI and the server must call it rather than reimplement it.

## Commands

Requires Node >= 22 (`.nvmrc`). pnpm is pinned via `packageManager`.

```bash
pnpm install
pnpm check
```

`pnpm check` is what CI runs locally: `format:check`, `lint`, `typecheck`, unit tests with coverage, e2e, and `pnpm audit --audit-level=high`. CodeQL, dependency review, and gitleaks run in GitHub Actions only.

| Script               | What it does                                                     |
| -------------------- | ---------------------------------------------------------------- |
| `pnpm format:check`  | Prettier                                                         |
| `pnpm lint`          | ESLint                                                           |
| `pnpm typecheck`     | `tsc` for the root and every package                             |
| `pnpm test`          | Unit tests, no coverage gate                                     |
| `pnpm test:coverage` | Unit tests plus the `packages/core` line-coverage threshold (80) |
| `pnpm test:e2e`      | CLI e2e (`vitest.e2e.config.ts`)                                 |
| `pnpm check`         | The full local gate                                              |
| `pnpm dev`           | Web dev server on `127.0.0.1:5173`                               |
| `pnpm exec gaveta`   | Current binary (prints the version until phase 1 commands land)  |

## Decisions (2026-10-22)

These are amendments to `docs/REQUIREMENTS.md`. Do not reopen them in a task.

- **Node >= 22.** The SQLite index uses built-in `node:sqlite` with FTS5, not `better-sqlite3`.
- **Slugs and filenames.** Lowercase, strip accents (NFD, then remove diacritics), map every non-alphanumeric to a hyphen, collapse and trim hyphens. A collision gets `-2`, `-3`, … on the base slug. Section ids use the same rule. File collisions are resolved in the destination directory; section-id collisions, inside the note.
- **CI platforms.** Linux and macOS now. Windows is T4.8, at the end of the project. REQ-NFR-05 still requires the product to work on Windows.
- **Language.** Code, comments, and commit messages are English. User-facing CLI messages (including JSON `message` and `hint`) are Spanish. Error codes stay the stable identifiers from the CLI contract.
- **DEC-02 and DEC-07 are approved.** TipTap plus CodeMirror 6, and unified/remark/rehype. Do not file a task whose only purpose is to approve them.

## Mandatory workflow

1. Read `docs/agents/LEARNINGS.md`.
2. Pick exactly one task id from `docs/TASKS.md`. Do not start a second task in the same pull request.
3. Read its REQ ids in `docs/REQUIREMENTS.md` and the acceptance criteria you must turn into tests.
4. Write failing tests first, then make them pass, then refactor.
   - Unit tests for core logic.
   - E2E tests for CLI and other user-visible behaviour. CLI e2e spawns the binary against fixture vaults. Playwright comes later, for the web app.
   - Security tests for anything that touches paths, HTML, or the network (path traversal, unsafe HTML, CSP).
5. Keep the pull request scoped to that task. Tick only your own line in `docs/TASKS.md`.
6. Run `pnpm check` and fix failures before pushing.
7. If CI fails, fix it yourself on the same branch until it is green.
8. Never disable or skip tests or lint rules to get green. Never lower coverage thresholds. Never commit secrets.
9. When you hit a pitfall the next agent would repeat, append one line to `docs/agents/LEARNINGS.md`.
