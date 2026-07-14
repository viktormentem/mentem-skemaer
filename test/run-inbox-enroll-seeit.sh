#!/usr/bin/env bash
# Runner for klient-inbox Batch 1B See-it web-walk. Starter lokal worker, koerer chromium-walken
# mod inbox-enroll.html (origin localhost:5173 = worker RP_ORIGIN), river ned. Dev/test-only.
set -euo pipefail

HER="$(cd "$(dirname "$0")" && pwd)"
SKEMAER_DIR="$(cd "$HER/.." && pwd)"
WORKER_DIR="${WORKER_DIR:-$(cd "$SKEMAER_DIR/../PsykologInvitation/ingest-worker" && pwd)}"
PORT="${PORT:-8787}"
API_BASE="http://127.0.0.1:${PORT}"
SHOT_DIR="${SHOT_DIR:-$SKEMAER_DIR/../Projekt_Praksis/.test-evidence/klient-inbox/seeit}"
export WORKER_DIR API_BASE SHOT_DIR
mkdir -p "$SHOT_DIR"

echo "== See-it: worker=$WORKER_DIR api=$API_BASE shots=$SHOT_DIR =="
cd "$WORKER_DIR"
[ -f .dev.vars ] || { echo "FEJL: $WORKER_DIR/.dev.vars mangler"; exit 2; }
[ -f test/.synthetic-key.json ] || { echo "FEJL: test/.synthetic-key.json mangler"; exit 2; }

echo "-- migrerer lokal D1 --"
D1_NAME="${D1_NAME:-mentem-ingest-eu}"
npx wrangler d1 migrations apply "$D1_NAME" --local >/tmp/mycel-seeit-migrate.log 2>&1 || { echo "FEJL migrate"; tail -20 /tmp/mycel-seeit-migrate.log; exit 2; }

echo "-- starter wrangler dev --"
npx wrangler dev --port "$PORT" --ip 127.0.0.1 >/tmp/mycel-seeit-dev.log 2>&1 &
DEV_PID=$!
cleanup() { kill "$DEV_PID" 2>/dev/null || true; wait "$DEV_PID" 2>/dev/null || true; }
trap cleanup EXIT

echo "-- venter paa /health --"
ok=0
for i in $(seq 1 60); do curl -fsS "$API_BASE/health" >/dev/null 2>&1 && { ok=1; break; }; sleep 1; done
[ "$ok" = 1 ] || { echo "FEJL: worker ikke oppe"; tail -30 /tmp/mycel-seeit-dev.log; exit 2; }

echo "-- koerer chromium See-it-walk --"
cd "$SKEMAER_DIR"
node test/inbox-enroll-seeit.mjs
