#!/bin/sh
#
# rotations-vagt.sh — NÆGTER at udrulle en MODTAGER-NØGLE-rotation så længe der er
# klienter midt i et søvnforløb som Mentem stadig er eneste læser af.
#
# 🔴 HVORFOR DEN FINDES. Søvnbehandlingen flytter til Mycel Journal (Viktor-ordre 22/8:
# »byg nu med levende klienter«, rotér SIDST). Kæden, målt led for led:
#
#     klientens browser krypterer til INGEST_PUBKEY   (index.html)
#     workeren GEMMER kun ciphertext                  (0 decrypt-træf i src/index.js)
#     Mentem dekrypterer med sit nøgleregister        (IngestKonvolutRouter)
#     SoevnAutoImport arbejder på den DEKRYPTEREDE konvolut
#       .dekrypteringFejlede -> .kryptoFejl -> .kræverMenneske
#     titreringen beregnes i Mentem ud fra de importerede nætter
#
# ⇒ Roteres nøglen FØR Journal kan beregne titrering, bliver hver indkommende nat til en
#   kryptofejl i det ENESTE system der kan handle på den. Målt 22/8: 8 aktive forløb, det
#   nyeste løber til ca. 15-11-2026.
#
# 🟡 Rækkefølgen ER besluttet rigtigt af Viktor. Denne vagt findes fordi en besluttet
# rækkefølge er noget nogen skal HUSKE, og en maskine der siger fra, er billigere end en
# hukommelse. Det er husets egen figur: »en forkontrol man kører men ikke standser på,
# er en kommentar«.
#
# EXIT
#   0  ingen rotation i dette deploy, ELLER rotation og NUL aktive forløb  -> fri
#   1  ROTATION med aktive forløb                                          -> BLOKÉR
#   3  UMÅLT: instrumentet kunne ikke måle. INGEN DOM.
#
# 🔴 3 OG IKKE 0 ER HELE POINTEN. Kan vi ikke tælle forløbene, ser »0 aktive« ud som
# grønt lys. Et målt nul og et kunne-ikke-måle må ALDRIG give samme udfald.
set -u

LIVE_URL="${MYCEL_ROTATION_LIVE_URL:-https://skemaer.mycel.dk/}"
REPO="$(cd "$(dirname "$0")/.." && pwd)"
APP_DOMAIN="${MYCEL_ROTATION_APP_DOMAIN:-dk.psykolog.invitation}"

umaalt() { echo "🔴 UMÅLT: $1" >&2; echo "   INSTRUMENTET ER DØDT, ingen dom afgives." >&2; exit 3; }

# ── Formtest, brugt af BEGGE arme (træ og live) ──────────────────────────────────
# 🔴 Én formtest brugt begge steder. Fremmed-domæne-vagten havde 19/8 en hex-kontrol på
# VORES egen sha og ingen på den fremmede, og læste derfor '<!DOCTY' som et versionsnummer.
# Kontrollen fandtes; den sad bare på den ene arm.
er_noegle() {
  printf '%s' "$1" | grep -qE '^[A-Za-z0-9_-]{43}$'
}

# SELVTEST UDEN NETVÆRK, kørt FØR nålen bruges.
er_noegle 'M8LHgVyDALEoCtm_Q6C2dZ73qPHvqy8VGtiLUiSjUwI' || umaalt "formtesten afviser en ÆGTE nøgle (POS)"
er_noegle '<!DOCTYPE html>'                              || : ; er_noegle '<!DOCTYPE html>' && umaalt "formtesten accepterer HTML (NEG)"
er_noegle 'deadbeef'                                     && umaalt "formtesten accepterer en for kort streng (NEG)"
er_noegle ''                                             && umaalt "formtesten accepterer tom streng (NEG)"

udtraek() { grep -ho "$2 *= *'[^']*'" "$1" 2>/dev/null | head -1 | sed "s/.*'\\(.*\\)'/\\1/"; }

# ── 0. ER DETTE OVERHOVEDET SKEMA-TRÆET? ─────────────────────────────────────────
# 🔴 HVORFOR SPØRGSMÅLET FINDES, og det er målt på mig selv 23/8 kl. 00.3x.
# `deploy-herkomst-test.sh` er en fitness-funktion: den bygger et SYNTETISK repo, lægger
# `deploy-skemaer.sh` ind i det og kører det med `--dry-run`. Da jeg koblede denne vagt ind
# i deploy-stien, kaldte det kopierede script en søskende der ikke fandtes i fixturet →
# rc 127 → **19 assertions gik fra grøn til rød**, og jeg havde allerede merget det.
#
# 🔴 OG DEN NEMME KUR VAR FORKERT: »mangler filerne, så spring over« er fail-OPEN på en
# sikkerhedsgate. Skelnen skal være POSITIV og målbar:
#     mentem-skema-core.js FINDES IKKE  -> det er ikke skema-træet. Der er ingen nøgle at
#                                          rotere, fordi der ingen flade er. rc 0, sig det.
#     den FINDES, men nøglerne kan ikke læses -> UMÅLT (rc 3). Det kan være at nogen har
#                                          FJERNET en nøgle, og det er en ændring af
#                                          modtager-opsætningen, ikke en ikke-ændring.
if [ ! -f "$REPO/mentem-skema-core.js" ]; then
  echo "🟢 rotations-vagt: $REPO er ikke skema-træet (ingen mentem-skema-core.js). Intet at dømme."
  exit 0
fi

# ── 1. NØGLERNE I TRÆET ──────────────────────────────────────────────────────────
TRAE_INGEST=$(udtraek "$REPO/index.html" INGEST_PUBKEY)
TRAE_PINNED=$(udtraek "$REPO/mentem-skema-core.js" PINNED_PUBKEY)
er_noegle "$TRAE_INGEST" || umaalt "kunne ikke læse INGEST_PUBKEY i træets index.html"
er_noegle "$TRAE_PINNED" || umaalt "kunne ikke læse PINNED_PUBKEY i træets mentem-skema-core.js"

# ── 2. NØGLERNE DER ER LIVE ──────────────────────────────────────────────────────
# 🔴 -L ER IKKE VALGFRI. `/index.html` svarer 308 og en TOM krop, og en tom krop giver
# nul træf på nøglen — altså »ingen rotation« om en side vi aldrig læste. Målt 22/8
# under bygningen af denne vagt, på mig selv.
# 🔴 TO NØGLER, TO FILER. `INGEST_PUBKEY` står i index.html (serveret på `/`), mens
# `PINNED_PUBKEY` står i `mentem-skema-core.js`, som index.html importerer som modul.
# Første udgave af denne vagt hentede kun `/` og gik UMÅLT på den anden , korrekt opførsel,
# og den fandt sit eget hul på første kørsel. **En vagt der nægter at dømme, fortæller hvor
# den er blind; en der gætter, gør ikke.**
TMP=$(mktemp) || umaalt "kunne ikke oprette midlertidig fil"
TMPC=$(mktemp) || umaalt "kunne ikke oprette midlertidig fil"
trap 'rm -f "$TMP" "$TMPC"' EXIT

hent() {   # hent <url> <fil> <poskt-markør>
  _k=$(curl -sL --max-time 20 -o "$2" -w '%{http_code}' "$1" 2>/dev/null) \
    || umaalt "kunne ikke hente $1"
  [ "$_k" = "200" ] || umaalt "$1 svarede HTTP $_k, ikke 200"
  [ -s "$2" ]       || umaalt "$1 svarede 200 med TOM krop"
  # POS-KTRL PÅ SELVE SVARET: er det overhovedet vores flade? En Pages-vært serverer sin
  # SPA-fallback for enhver ukendt sti, og en fallback er aldrig tom.
  grep -q "$3" "$2" || umaalt "$1 bærer ikke »$3«. Det er ikke den fil vi tror."
}
hent "$LIVE_URL" "$TMP" 'mentem-deploy-sha'
hent "${LIVE_URL%/}/mentem-skema-core.js" "$TMPC" 'PINNED_KEY_ID'

LIVE_INGEST=$(udtraek "$TMP" INGEST_PUBKEY)
LIVE_PINNED=$(udtraek "$TMPC" PINNED_PUBKEY)
er_noegle "$LIVE_INGEST" || umaalt "kunne ikke læse INGEST_PUBKEY på den LIVE flade"
er_noegle "$LIVE_PINNED" || umaalt "kunne ikke læse PINNED_PUBKEY på den LIVE flade"

# ── 3. ER DETTE DEPLOY EN ROTATION? ──────────────────────────────────────────────
ROTERER=""
[ "$TRAE_INGEST" != "$LIVE_INGEST" ] && ROTERER="INGEST_PUBKEY"
[ "$TRAE_PINNED" != "$LIVE_PINNED" ] && ROTERER="${ROTERER:+$ROTERER + }PINNED_PUBKEY"

if [ -z "$ROTERER" ]; then
  echo "🟢 rotations-vagt: ingen nøgle-rotation i dette deploy (begge nøgler uændrede). Fri."
  exit 0
fi

# ── 4. HVOR MANGE KLIENTER ER MIDT I ET FORLØB? ──────────────────────────────────
# 🔴 TÆLLES MOD plannedDays, IKKE mod `aktiv`. Målt 22/8: 16 stod `aktiv=true`, men 8 af
# dem var 24-58 dage OVER deres vindue. »aktiv« alene er ikke et svar.
AKTIVE=$(python3 - "$APP_DOMAIN" <<'PY' 2>/dev/null
import subprocess, plistlib, json, sys, datetime
dom = sys.argv[1]
raw = subprocess.run(['defaults','export',dom,'-'], capture_output=True).stdout
d = plistlib.loads(raw)
v = d['MentemSoevnForloeb']
data = json.loads(v.decode('utf-8') if isinstance(v,(bytes,bytearray)) else v)
if not isinstance(data, list) or not data:
    raise SystemExit(9)          # tom liste != nul aktive; det er en mistænkelig måling
EP = datetime.datetime(2001,1,1)
nu = datetime.datetime.utcnow()
n = 0
for x in data:
    pd = x.get('plannedDays') or 0
    s = EP + datetime.timedelta(seconds=float(x['startDato']))
    if x.get('aktiv') and pd and (nu - s).days <= pd:
        n += 1
print(n)
PY
) || umaalt "kunne ikke tælle aktive søvnforløb i $APP_DOMAIN (MentemSoevnForloeb). Uden det tal er 'nul aktive' ikke til at skelne fra 'kunne ikke måle'."
printf '%s' "$AKTIVE" | grep -qE '^[0-9]+$' || umaalt "forløbs-tællingen gav '$AKTIVE', ikke et tal"

# ── 5. DOMMEN ────────────────────────────────────────────────────────────────────
if [ "$AKTIVE" -eq 0 ]; then
  echo "🟢 rotations-vagt: $ROTERER roteres, og der er 0 aktive søvnforløb. Fri."
  exit 0
fi

NY="$TRAE_INGEST"
[ "$TRAE_INGEST" = "$LIVE_INGEST" ] && NY="$TRAE_PINNED"

if [ "${MYCEL_ROTATION_GO:-}" = "$NY" ]; then
  echo "🟡 ROTATION OVERSTYRET: $AKTIVE aktive forløb, og du navngav den nye nøgle." >&2
  echo "   Deployet fortsætter. Hver nat fra de $AKTIVE klienter bliver kryptoFejl i Mentem," >&2
  echo "   indtil den nye modtager kan læse dem." >&2
  exit 0
fi

cat >&2 <<EOF
🔴 ABORT (rotation): $ROTERER roteres, mens $AKTIVE klient(er) er midt i et søvnforløb.

   Mentem er i dag eneste læser af de nætter. Efter rotationen bliver hver indkommende
   nat til .kryptoFejl -> .kræverMenneske i SoevnAutoImport, og titreringen kan ikke
   beregnes. Det er ikke en teknisk regression: det er $AKTIVE mennesker hvis næste
   søvnvindue udebliver.

   Rotér FØRST når den nye modtager kan beregne en titrering, eller når de sidste
   forløb er afsluttet.

   Er det bevidst, så navngiv den præcise nye nøgle (kan ikke sættes én gang og glemmes):
     MYCEL_ROTATION_GO=$NY bash build-tools/deploy-skemaer.sh
EOF
exit 1
