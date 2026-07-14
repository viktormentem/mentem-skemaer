#!/usr/bin/env bash
# Runner for klient-inbox Batch 1B enroll-drive VERA.
# Spinner en LOKAL `wrangler dev` op i ingest-worker, migrerer lokal D1, venter paa /health,
# koerer node-testen mod den, river ned. Dev/test-only. NUL rigtig klient-data / prod.
set -euo pipefail

HER="$(cd "$(dirname "$0")" && pwd)"
SKEMAER_DIR="$(cd "$HER/.." && pwd)"
WORKER_DIR="${WORKER_DIR:-$(cd "$SKEMAER_DIR/../PsykologInvitation/ingest-worker" && pwd)}"
PORT="${PORT:-8787}"
BASE="http://127.0.0.1:${PORT}"
export BASE WORKER_DIR

echo "== enroll-VERA: worker=$WORKER_DIR base=$BASE =="

cd "$WORKER_DIR"
[ -f .dev.vars ] || { echo "FEJL: $WORKER_DIR/.dev.vars mangler (kopier .dev.vars.example + npm run gen-key)"; exit 2; }
[ -f test/.synthetic-key.json ] || { echo "FEJL: test/.synthetic-key.json mangler (npm run gen-key)"; exit 2; }

echo "-- migrerer lokal D1 (binding-navn fra wrangler.toml) --"
D1_NAME="${D1_NAME:-mentem-ingest-eu}"
npx wrangler d1 migrations apply "$D1_NAME" --local >/tmp/mycel-enroll-vera-migrate.log 2>&1 || {
  echo "FEJL: d1 migrate; se /tmp/mycel-enroll-vera-migrate.log"; tail -20 /tmp/mycel-enroll-vera-migrate.log; exit 2; }

echo "-- starter wrangler dev (baggrund) --"
npx wrangler dev --port "$PORT" --ip 127.0.0.1 >/tmp/mycel-enroll-vera-dev.log 2>&1 &
DEV_PID=$!
cleanup() { kill "$DEV_PID" 2>/dev/null || true; wait "$DEV_PID" 2>/dev/null || true; }
trap cleanup EXIT

echo "-- venter paa /health --"
ok=0
for i in $(seq 1 60); do
  if curl -fsS "$BASE/health" >/dev/null 2>&1; then ok=1; break; fi
  sleep 1
done
[ "$ok" = 1 ] || { echo "FEJL: worker svarede ikke paa /health inden timeout; se /tmp/mycel-enroll-vera-dev.log"; tail -30 /tmp/mycel-enroll-vera-dev.log; exit 2; }

echo "-- koerer node-VERA --"
cd "$SKEMAER_DIR"
node test/inbox-enroll-vera.mjs
RC=$?
exit $RC
