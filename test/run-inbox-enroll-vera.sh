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

# 🔴 EN FREMMED WORKER PAA PORTEN ER IKKE MIN WORKER (maalt 16/8). En efterladt
# `wrangler dev` fra 14/8 kl. 21:22 laa paa 8787 i 38 timer og svarede 200 paa /health.
# Parathedsnaalen nedenfor spoerger kun »svarer der nogen«, saa den gik videre, og walken
# maalte mod en worker runneren ikke selv havde startet. Resultatet var to harnesser der
# stod ROED paa en flade der virker. Derfor spoerges der FOER vi starter noget.
# rc 3 = UMAALT, aldrig 1 (maalt og roedt) og aldrig 2 (syntaksfejl).
if curl -fsS "$BASE/health" >/dev/null 2>&1; then
  echo "UMAALT: der lytter allerede noget paa $BASE som denne runner ikke har startet." >&2
  echo "  Se hvem:  lsof -nP -iTCP:${PORT} -sTCP:LISTEN" >&2
  echo "  Ryd op, eller koer med PORT=<ledig port>. Ingen dom afgivet." >&2
  exit 3
fi

echo "-- starter wrangler dev (baggrund) --"
set -m
npx wrangler dev --port "$PORT" --ip 127.0.0.1 >/tmp/mycel-enroll-vera-dev.log 2>&1 &
DEV_PID=$!
set +m
# 🔴 GRUPPEDRAB, IKKE KUN $DEV_PID. `workerd` er et BARNEBARN af wrangler og overlever
# sin bedsteforaelder: maalt 16/8 levede pid 65740 videre i 38 timer efter koerslen 14/8.
# **En oprydning der kun rydder det den selv startede, rydder ikke det der holder porten.**
# `set -m` giver jobbet sin egen procesgruppe, saa `kill -- -$PID` naar barnebarnet.
cleanup() {
  kill -- "-$DEV_PID" 2>/dev/null || kill "$DEV_PID" 2>/dev/null || true
  wait "$DEV_PID" 2>/dev/null || true
  for _ in 1 2 3 4 5; do
    curl -fsS "$BASE/health" >/dev/null 2>&1 || return 0
    sleep 1
  done
  echo "ADVARSEL: noget lytter stadig paa $BASE efter oprydning (lsof -nP -iTCP:${PORT} -sTCP:LISTEN)." >&2
}
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
