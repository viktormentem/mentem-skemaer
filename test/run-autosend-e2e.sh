#!/usr/bin/env bash
# run-autosend-e2e.sh — synthetic E2E for web-producent-benet (#1/#2/#4).
# Starter en LOKAL ingest-worker (D1-eu, syntetiske secrets), kører Playwright-
# orkestratoren (test/e2e-autosend.mjs), river worker ned igen. NUL ægte PHI.
#
#   bash test/run-autosend-e2e.sh
#
# Env-overrides:
#   WORKER_DIR  default /private/tmp/wt-ingest-d1-eu/ingest-worker
#   WORKER_PORT default 8787
set -euo pipefail

WORKER_DIR="${WORKER_DIR:-/private/tmp/wt-ingest-d1-eu/ingest-worker}"
WORKER_PORT="${WORKER_PORT:-8787}"
WORKER_BASE="http://127.0.0.1:${WORKER_PORT}"
HERE="$(cd "$(dirname "$0")/.." && pwd)"   # mentem-skemaer/

if [ ! -d "$WORKER_DIR" ]; then echo "Mangler worker-dir: $WORKER_DIR (sæt WORKER_DIR=)"; exit 2; fi
if [ ! -f "$WORKER_DIR/test/.synthetic-key.json" ]; then
  echo "Genererer syntetisk token-nøgle ..."; ( cd "$WORKER_DIR" && npm run --silent gen-key ); fi

WORKER_PID=""
cleanup() { [ -n "$WORKER_PID" ] && kill "$WORKER_PID" 2>/dev/null || true; }
trap cleanup EXIT

echo "==> migrate:local (idempotent)"
( cd "$WORKER_DIR" && npm run --silent migrate:local )

echo "==> starter worker @ $WORKER_BASE"
( cd "$WORKER_DIR" && npx wrangler dev --port "$WORKER_PORT" --ip 127.0.0.1 ) >/tmp/mentem-ingest-dev.log 2>&1 &
WORKER_PID=$!

echo -n "==> venter på /health "
for i in $(seq 1 60); do
  if curl -fsS "$WORKER_BASE/health" >/dev/null 2>&1; then echo " ok"; break; fi
  if ! kill -0 "$WORKER_PID" 2>/dev/null; then echo " worker døde — se /tmp/mentem-ingest-dev.log"; tail -20 /tmp/mentem-ingest-dev.log; exit 1; fi
  sleep 1; echo -n "."
  if [ "$i" -eq 60 ]; then echo " timeout"; tail -20 /tmp/mentem-ingest-dev.log; exit 1; fi
done

echo "==> kører orkestrator (Playwright)"
WORKER_BASE="$WORKER_BASE" SYNTH_KEYFILE="$WORKER_DIR/test/.synthetic-key.json" \
  node "$HERE/test/e2e-autosend.mjs"
