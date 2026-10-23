#!/usr/bin/env bash
# Prepares a disposable demo vault for manual gate T2.11 (phase 2).
# Safe to re-run: uses GAVETA_GATE_VAULT (default: $TMPDIR/gaveta-gate-t2.11).
set -euo pipefail

readonly GATE_VERSION=3
readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
readonly SHOWCASE="${REPO_ROOT}/fixtures/showcase"
readonly MARKDOWN="${REPO_ROOT}/fixtures/markdown"
readonly PROBLEMS="${REPO_ROOT}/fixtures/vaults/problems"
readonly GAVETA_BIN="${REPO_ROOT}/packages/cli/bin/gaveta.js"
readonly GATE_VAULT="${GAVETA_GATE_VAULT:-${TMPDIR:-/tmp}/gaveta-gate-t2.11}"
readonly STAMP_FILE="${GATE_VAULT}/.gate-t2.11-version"

CHECK_ONLY=0
SKIP_SERVE=0

usage() {
  cat <<'EOF'
Uso: scripts/gate-t2.11.sh [--check] [--skip-serve]

  --check       Prepara el vault de demo, verifica el resultado y sale (CI).
  --skip-serve  Solo prepara el vault e imprime instrucciones; no arranca serve ni edita.

Variables:
  GAVETA_GATE_VAULT   Ruta del vault temporal (por defecto $TMPDIR/gaveta-gate-t2.11).

El vault de demo no toca tu vault habitual: vive solo en GAVETA_GATE_VAULT.
EOF
}

log() {
  printf '==> %s\n' "$*"
}

die() {
  printf 'error: %s\n' "$*" >&2
  exit 1
}

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --check)
        CHECK_ONLY=1
        ;;
      --skip-serve)
        SKIP_SERVE=1
        ;;
      -h | --help)
        usage
        exit 0
        ;;
      *)
        die "argumento desconocido: $1"
        ;;
    esac
    shift
  done
}

gaveta() {
  node "${GAVETA_BIN}" --vault "${GATE_VAULT}" "$@"
}

ensure_prereqs() {
  [[ -d "${SHOWCASE}" ]] || die "no se encuentra fixtures/showcase"
  [[ -f "${GAVETA_BIN}" ]] || die "no se encuentra el binario CLI en ${GAVETA_BIN}"
}

prepare_vault() {
  if [[ -f "${STAMP_FILE}" ]] && [[ "$(cat "${STAMP_FILE}")" == "${GATE_VERSION}" ]]; then
    log "Vault de demo ya preparado en ${GATE_VAULT}"
    return 0
  fi

  log "Creando vault de demo en ${GATE_VAULT}"
  rm -rf "${GATE_VAULT}"
  mkdir -p "${GATE_VAULT}"
  cp -R "${SHOWCASE}/." "${GATE_VAULT}/"

  log "Importando notas Markdown de fixtures"
  gaveta import "${MARKDOWN}/tareas/tareas-basicas.md" --in importados/tareas --on-conflict skip --json >/dev/null
  gaveta import "${MARKDOWN}/enlaces/wikilinks.md" --in importados/enlaces --on-conflict skip --json >/dev/null
  gaveta import "${MARKDOWN}/contenido/mermaid.md" --in importados/contenido --on-conflict skip --json >/dev/null
  gaveta import "${MARKDOWN}/presentacion/diapositivas-marp.md" --in importados/presentacion --on-conflict skip --json >/dev/null

  log "Añadiendo nota con hallazgos de doctor (solo demo)"
  mkdir -p "${GATE_VAULT}/importados/salud"
  cp "${PROBLEMS}/nota-rota.html" "${GATE_VAULT}/importados/salud/nota-rota.html"

  gaveta new "Panel KPI demo" --type dashboard --in importados/artefactos --from - --json <<'HTML' >/dev/null
<article class="g-dashboard">
  <h1>Panel KPI demo</h1>
  <gaveta-kpi class="g-kpi" data-label="Notas">12</gaveta-kpi>
</article>
HTML

  gaveta new "Recarga en vivo" --type doc --in importados/demo --from - --json <<'HTML' >/dev/null
<h1>Recarga en vivo</h1>
<section id="cuerpo">
  <p>Estado inicial de la puerta T2.11.</p>
</section>
HTML

  log "Añadiendo nota huérfana y enlace fantasma para /grafo"
  gaveta new "Nota huérfana T2.11" --type doc --in importados/grafo --from - --json <<'HTML' >/dev/null
<h1>Nota huérfana T2.11</h1>
<section id="cuerpo">
  <p>Sin enlaces entrantes ni salientes (para probar «Ocultar huérfanas»).</p>
</section>
HTML

  gaveta new "Enlace al fantasma" --type doc --in importados/grafo --from - --json <<'HTML' >/dev/null
<h1>Enlace al fantasma</h1>
<section id="cuerpo">
  <p>
    Destino pendiente:
    <a data-g-pending="Puerta fantasma T2.11">crear nota</a>
  </p>
</section>
HTML

  printf '%s' "${GATE_VERSION}" >"${STAMP_FILE}"
}

verify_vault() {
  [[ -f "${GATE_VAULT}/vitrina-doc.html" ]] || die "falta vitrina-doc.html"
  [[ -f "${GATE_VAULT}/importados/tareas/tareas-basicas.html" ]] || die "falta import tareas-basicas"
  [[ -f "${GATE_VAULT}/importados/salud/nota-rota.html" ]] || die "falta nota-rota de demo"
  [[ -f "${GATE_VAULT}/importados/demo/recarga-en-vivo.html" ]] || die "falta nota recarga en vivo"
  [[ -f "${GATE_VAULT}/importados/grafo/nota-huerfana-t2-11.html" ]] || die "falta nota huérfana de grafo"
  [[ -f "${GATE_VAULT}/importados/grafo/enlace-al-fantasma.html" ]] || die "falta nota con enlace fantasma"
  gaveta doctor --json >/dev/null || true
  gaveta graph --json | node -e '
const fs = require("node:fs");
const body = JSON.parse(fs.readFileSync(0, "utf8"));
const nodes = body.data?.nodes ?? [];
const hasGhost = nodes.some((node) => node.ghost === true);
const hasOrphan = nodes.some(
  (node) =>
    node.ghost !== true &&
    node.path === "importados/grafo/nota-huerfana-t2-11.html",
);
if (!hasGhost) process.exit(1);
if (!hasOrphan) process.exit(1);
' || die "el grafo de demo debe incluir un fantasma y la nota huérfana"
}

read_serve_envelope() {
  local log_file="$1"
  local waited=0
  while [[ "${waited}" -lt 30 ]]; do
    if grep -q '"schemaVersion"' "${log_file}" 2>/dev/null; then
      node -e '
const fs = require("node:fs");
const text = fs.readFileSync(process.argv[1], "utf8");
const start = text.indexOf("{");
const end = text.lastIndexOf("}");
if (start < 0 || end < start) process.exit(1);
const body = JSON.parse(text.slice(start, end + 1));
if (!body.ok || !body.data?.token || !body.data?.url) process.exit(1);
process.stdout.write(`${body.data.url}?token=${encodeURIComponent(body.data.token)}\n`);
process.stdout.write(`${body.data.token}\n`);
' "${log_file}"
      return 0
    fi
    sleep 0.2
    waited=$((waited + 1))
  done
  die "timeout esperando gaveta serve"
}

start_serve_background() {
  local log_file
  log_file="$(mktemp)"
  log "Arrancando gaveta serve en segundo plano (log: ${log_file})"
  (
    cd "${GATE_VAULT}"
    GAVETA_VAULT="${GATE_VAULT}" node "${GAVETA_BIN}" serve --json --port 0
  ) >"${log_file}" 2>&1 &
  SERVE_PID=$!
  local envelope_lines
  envelope_lines="$(read_serve_envelope "${log_file}")"
  APP_URL="$(printf '%s\n' "${envelope_lines}" | sed -n '1p')"
  SESSION_TOKEN="$(printf '%s\n' "${envelope_lines}" | sed -n '2p')"
  export SERVE_LOG="${log_file}"
}

run_live_edit_demo() {
  log "Editando «Recarga en vivo» para probar recarga en vivo"
  printf '<p>Actualización en vivo (puerta T2.11, %s).</p>\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" | \
    gaveta edit "Recarga en vivo" --section cuerpo --append --from - --json >/dev/null
}

print_instructions() {
  cat <<EOF

Vault de demo: ${GATE_VAULT}
Abre la app con token (copia la URL completa):

  ${APP_URL:-http://127.0.0.1:<puerto>/?token=<token>}

Token de sesión (cabecera x-gaveta-token): ${SESSION_TOKEN:-<arranca serve para obtenerlo>}

Sigue la checklist: docs/gates/T2.11.md

EOF
}

cleanup_serve() {
  if [[ -n "${SERVE_PID:-}" ]] && kill -0 "${SERVE_PID}" 2>/dev/null; then
    kill "${SERVE_PID}" 2>/dev/null || true
    wait "${SERVE_PID}" 2>/dev/null || true
  fi
}

main() {
  parse_args "$@"
  ensure_prereqs
  prepare_vault
  verify_vault

  if [[ "${CHECK_ONLY}" -eq 1 ]]; then
    log "Modo --check: serve de humo"
    smoke_log="$(mktemp)"
    (
      cd "${GATE_VAULT}"
      GAVETA_VAULT="${GATE_VAULT}" node "${GAVETA_BIN}" serve --json --port 0
    ) >"${smoke_log}" 2>&1 &
    smoke_pid=$!
    trap 'kill "${smoke_pid}" 2>/dev/null || true' EXIT
    read_serve_envelope "${smoke_log}" >/dev/null
    run_live_edit_demo
    kill "${smoke_pid}" 2>/dev/null || true
    wait "${smoke_pid}" 2>/dev/null || true
    trap - EXIT
    log "OK"
    exit 0
  fi

  if [[ "${SKIP_SERVE}" -eq 1 ]]; then
    log "Vault listo. Arranca manualmente:"
    printf '  cd %q && GAVETA_VAULT=%q node %q serve --json --port 3847\n' \
      "${GATE_VAULT}" "${GATE_VAULT}" "${GAVETA_BIN}"
    exit 0
  fi

  trap cleanup_serve EXIT
  start_serve_background
  print_instructions
  run_live_edit_demo
  log "Serve sigue en ejecución (PID ${SERVE_PID}). Pulsa Ctrl+C para detenerlo."
  wait "${SERVE_PID}"
}

main "$@"
