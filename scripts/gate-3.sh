#!/usr/bin/env bash
# Phase 3 gate (T3.9): automated fixture round-trips + manual checklist in docs/gates/fase-3.md
set -euo pipefail

readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

log() {
  printf '==> %s\n' "$*"
}

die() {
  printf 'error: %s\n' "$*" >&2
  exit 1
}

cd "${REPO_ROOT}"

if ! command -v pnpm >/dev/null 2>&1; then
  die 'pnpm is required'
fi

log 'Running automated phase 3 round-trip tests (fixtures + gate-1 markdown import)'
pnpm exec vitest run tests/gate-phase3-round-trip.test.ts --reporter=dot

log 'Automated gate passed. Complete the manual checklist in docs/gates/fase-3.md and fill in Resultados / Results.'
