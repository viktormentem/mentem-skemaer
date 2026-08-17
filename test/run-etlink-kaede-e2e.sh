#!/usr/bin/env bash
# run-etlink-kaede-e2e.sh — synthetic E2E for EET LINK gennem flere opgaver (Viktor-ordre 17/8).
# Starter en LOKAL ingest-worker (D1-eu, syntetiske secrets), kører Playwright-
# orkestratoren (test/e2e-etlink-kaede.mjs), river worker ned igen. NUL ægte PHI.
#
#   bash test/run-etlink-kaede-e2e.sh
#
# Env-overrides:
#   WORKER_DIR  default <PsykologInvitation>/ingest-worker  (det KANONISKE træ)
#   WORKER_PORT default 8789 (IKKE 8787: autosend-runneren bor der, og to runnere paa
#               samme port ville maale hinandens worker)
set -euo pipefail

HERE="$(cd "$(dirname "$0")/.." && pwd)"   # mentem-skemaer/
# 🔴 Defaulten pegede på `/private/tmp/wt-ingest-d1-eu/ingest-worker`, en worktree der er
# ryddet, så runneren stoppede før den nåede at måle noget. En sti der ikke findes, er
# ikke en default, det er en død måler, og bag den lå 14/8 en anden fejl ingen kunne se.
WORKER_DIR="${WORKER_DIR:-$(cd "$HERE/../PsykologInvitation/ingest-worker" 2>/dev/null && pwd || true)}"
WORKER_PORT="${WORKER_PORT:-8789}"
WORKER_BASE="http://127.0.0.1:${WORKER_PORT}"

# rc 3 = UMÅLT (en forudsætning mangler), aldrig 1 (målt og rødt), aldrig 2 (syntaksfejl).
if [ -z "$WORKER_DIR" ] || [ ! -d "$WORKER_DIR" ]; then
  echo "UMÅLT: mangler worker-dir '${WORKER_DIR:-<tom>}' (sæt WORKER_DIR=). Ingen dom afgivet." >&2
  exit 3
fi

# 🔴 `npm run gen-key` er FJERNET med vilje: den mønter et NYT nøglepar, mens workeren
# verificerer mod den pubkey der er pinnet i .dev.vars. Et frisk par giver derfor et token
# der afvises, og afvisningen ligner ikke »forkert nøgle«. test/_forudsaetning.mjs
# kopierer i stedet den nøgle der allerede matcher pinningen, eller siger fra med rc 3.

# 🔴 EN FREMMED WORKER PÅ PORTEN ER IKKE MIN WORKER. Målt 16/8: en efterladt `wrangler dev`
# fra 14/8 kl. 21:22 lå på 8787 i 38 timer, svarede 200 på /health, og fik parathedsnålen
# nedenfor til at gå videre, så walken målte mod en worker runneren ikke selv havde startet.
# **En parathedsnål der kun spørger »svarer der nogen« kan ikke svare på »svarer den
# rigtige«.** Derfor spørges der FØR vi starter noget, hvor svaret stadig er entydigt.
if curl -fsS "$WORKER_BASE/health" >/dev/null 2>&1; then
  echo "UMÅLT: der lytter allerede noget på $WORKER_BASE som denne runner ikke har startet." >&2
  echo "  Den svarer på /health, så parathedsnålen ville gå videre og måle en fremmed worker." >&2
  echo "  Se hvem:  lsof -nP -iTCP:${WORKER_PORT} -sTCP:LISTEN" >&2
  echo "  Ryd op, eller kør med WORKER_PORT=<ledig port>. Ingen dom afgivet." >&2
  exit 3
fi

WORKER_PID=""
# 🔴 DEN EFTERLADTE WORKER KOM HERFRA. `kill "$WORKER_PID"` dræber det subshell der wrapper
# `npx wrangler dev`; selve `workerd` er et BARNEBARN og overlever sin bedsteforælder.
# Målt 16/8: pid 65740 (workerd) levede videre under pid 65713 (wrangler) i 38 timer efter
# kørslen 14/8. **En oprydning der kun rydder det den selv startede, rydder ikke det der
# holder porten.** Derfor dræbes hele procesgruppen, og porten efterprøves bagefter.
cleanup() {
  [ -n "$WORKER_PID" ] || return 0
  kill -- "-$WORKER_PID" 2>/dev/null || kill "$WORKER_PID" 2>/dev/null || true
  for _ in 1 2 3 4 5; do
    curl -fsS "$WORKER_BASE/health" >/dev/null 2>&1 || return 0
    sleep 1
  done
  echo "ADVARSEL: noget lytter stadig på $WORKER_BASE efter oprydning." >&2
  echo "  lsof -nP -iTCP:${WORKER_PORT} -sTCP:LISTEN" >&2
}
trap cleanup EXIT

echo "==> migrate:local (idempotent)"
( cd "$WORKER_DIR" && npm run --silent migrate:local )

echo "==> starter worker @ $WORKER_BASE"
# `set -m` giver baggrundsjobbet sin EGEN procesgruppe, så `kill -- -$PID` i cleanup rammer
# workerd-barnebarnet og ikke kun wrapper-subshellet. Uden den er pgid'et scriptets eget,
# og et gruppedrab ville slå scriptet selv ihjel før oprydningen var færdig.
set -m
( cd "$WORKER_DIR" && npx wrangler dev --port "$WORKER_PORT" --ip 127.0.0.1 ) >/tmp/mentem-ingest-dev.log 2>&1 &
WORKER_PID=$!
set +m

echo -n "==> venter på /health "
for i in $(seq 1 60); do
  if curl -fsS "$WORKER_BASE/health" >/dev/null 2>&1; then echo " ok"; break; fi
  if ! kill -0 "$WORKER_PID" 2>/dev/null; then echo " worker døde — se /tmp/mentem-ingest-dev.log"; tail -20 /tmp/mentem-ingest-dev.log; exit 1; fi
  sleep 1; echo -n "."
  if [ "$i" -eq 60 ]; then echo " timeout"; tail -20 /tmp/mentem-ingest-dev.log; exit 1; fi
done

echo "==> kører orkestrator (Playwright)"
# 🔵 WORKER_DIR, ikke SYNTH_KEYFILE: en eksplicit filsti ville tilsidesætte gaten i
# test/_forudsaetning.mjs, og dermed slå både selvhelbredelsen og pubkey-kontrollen fra.
WORKER_BASE="$WORKER_BASE" WORKER_DIR="$WORKER_DIR" \
  node "$HERE/test/e2e-etlink-kaede.mjs"
