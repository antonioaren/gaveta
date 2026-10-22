# Agent learnings

Short log of pitfalls found while implementing tasks. Read this before starting a task. Append one line when you hit something the next agent would otherwise repeat. Do not delete earlier lines.

Format: `YYYY-MM-DD · T<id> · what went wrong · how it was fixed`

- 2026-10-22 · T0.3 · The VM snapshot can lag `origin/main` (T0.2 was already merged). · `git fetch origin main` before treating a merged task as missing.
