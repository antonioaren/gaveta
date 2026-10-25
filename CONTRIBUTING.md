# Contributing

Thanks for your interest in Gaveta. The project is early and moves quickly; the bar for merges is **tests first**, a **single scoped change**, and **green CI**.

## Language

- **Code, comments, commit messages, and identifiers:** English.
- **User-facing CLI messages** (including JSON `message` and `hint` fields): Spanish, per product convention.
- **Stable error codes** stay as documented (`E_…`, `W_…`).

## Setup

Requires **Node.js ≥ 22.18** (see `.nvmrc`) and **pnpm** (version pinned in `packageManager`).

```bash
corepack enable
pnpm install
```

Useful scripts:

| Command              | Purpose                                                               |
| -------------------- | --------------------------------------------------------------------- |
| `pnpm check`         | Full local gate (format, lint, typecheck, coverage tests, e2e, audit) |
| `pnpm test`          | Unit tests without coverage gate                                      |
| `pnpm test:e2e`      | CLI e2e (spawns the `gaveta` binary)                                  |
| `pnpm dev`           | Web dev server on `127.0.0.1:5173`                                    |
| `pnpm exec gaveta …` | Run the CLI from the workspace                                        |

Read [AGENTS.md](AGENTS.md) for repository layout and agent workflow.

## Test-driven development

1. Read the requirement ids for your change in [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md).
2. Add **failing** tests that encode the acceptance criteria (unit tests next to core logic; CLI e2e under `e2e/`; Playwright for web behaviour).
3. Implement until tests pass, then refactor.
4. Run `pnpm check` before you push.

Do not skip tests, disable lint rules, or lower coverage thresholds to get green.

## Pull requests

Use the [pull request template](.github/pull_request_template.md):

- One **task id** from [docs/TASKS.md](docs/TASKS.md) per PR when the change is task-scoped.
- List **REQ ids** covered.
- Note which test layers you added (unit, e2e, security).
- Confirm `pnpm check` and CI on Linux and macOS.
- Tick **only your task line** in `docs/TASKS.md` when applicable.
- Append a dated pitfall to [docs/agents/LEARNINGS.md](docs/agents/LEARNINGS.md) if you hit something the next contributor would repeat.

Branch names in this repo often use the `cursor/<description>-<suffix>` pattern for cloud agent work; any descriptive branch is fine for human contributors.

## Security and scope

- Validate input at boundaries; keep vault paths inside the vault.
- No telemetry or calls to remote hosts from the server (loopback only).
- Never commit secrets, tokens, or credentials.

Questions and ideas: open a [feature request](.github/ISSUE_TEMPLATE/feature_request.yml) or [bug report](.github/ISSUE_TEMPLATE/bug_report.yml).
