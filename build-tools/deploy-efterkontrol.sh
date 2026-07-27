#!/usr/bin/env bash
#
# deploy-efterkontrol.sh - er den udrulning der lige skete, rent faktisk fremme hos klienten?
#
# HVORFOR DEN FINDES (maalt 27/7 af INFRA, ikke formodet):
#   skemaer.mycel.dk stod nede i 18 timer, opdaget af en klient. Produktions-udrulningen
#   `ea2f80e6` indeholdt praecis EEN fil: `deploy-sha.txt`. Hvert klient-link gav en blank side.
#   `deploy-skemaer.sh` sluttede paa det tidspunkt med fem linjer der PRINTEDE hvad et menneske
#   burde koere bagefter, med overskriften »VERIFICER (uden query-string!)«.
#
#   🔴 To ting var galt, og den anden er den dyre:
#     1. Den anbefalede forespoergsel var den bare rod. Den er det ENESTE svar Cloudflare
#        stadig havde i kanten (`age: 72240`). Alt med en query-streng har en anden cache-
#        noegle, rammer origin og fik 404. Efterproevningen laeste altsaa en 20 timer gammel
#        kopi og sagde groent om en flade der var vaek.
#     2. 🔴 Vigtigere: den blev aldrig KOERT. Scriptet exittede 0 efter at have udskrevet
#        prosa. **En efterproevning der ikke eksekveres, kan ikke gaa roed**, og huset havde
#        derfor intet signal overhovedet i 18 timer. Det er samme klasse som `loefte-vagt.sh`
#        blev bygget imod 27/7: en erklaering lyder som en kvittering, og ingen gate laeser prosa.
#
# 🔴 HVORFOR DEN LIGGER UDEN FOR `deploy-skemaer.sh`, selvom den kaldes derfra:
#   En kontrol der kun findes inde i deploy-trinnet, kan kun maale de udrulninger der naaede
#   til vejs ende. Den kan desuden kun maale i det oejeblik hvor alt lige er sat op. Som
#   selvstaendigt script kan den ogsaa koeres i morgen, mod en flade der er gaaet i stykker af
#   sig selv, uden at nogen udruller noget. Nedbruddet 26/7 varede 18 timer alene fordi der
#   ikke fandtes en kommando nogen kunne koere for at spoerge »er siden der«.
#
# 🔴 HVAD DEN MAALER, OG HVORFOR EN HTTP-KODE IKKE ER NOK:
#   Cloudflare Pages svarer med index.html og status 200 for stier der ikke findes (SPA-
#   fallback). En proeve der kun ser paa koden, ville altsaa vaere groen for en udrulning hvor
#   `deploy-sha.txt` var vaek. Derfor sammenlignes INDHOLD mod den SHA udrulningen selv
#   staemplede: det er det eneste svar der ikke kan opstaa ved et tilfaelde.
#
# BRUG:
#   bash build-tools/deploy-efterkontrol.sh --url https://skemaer.mycel.dk --sha <40-cifret>
#   bash build-tools/deploy-efterkontrol.sh --url https://<id>.mycel-skemaer.pages.dev --sha <sha>
#   (uden --sha: hentes den fra fladens eget /deploy-sha.txt, altsaa en ren »hvad koerer der«)
#
# Exit: 0 = fladen er hel og er den navngivne udrulning · 1 = mindst een kontrol roed
#       2 = brugsfejl (manglende argument)
set -uo pipefail

BASE=""
VENTET_SHA=""
SKEMA="soevndagbog"      # klientens egen form. Et skema der beviseligt fandtes i den doede udrulning.
GULV=10000               # bytes. En hel forside er ~200 kB; en tom eller fejlende er 0.
TIMEOUT=20
STILLE=""
MASKINE=""

while [ $# -gt 0 ]; do
  case "$1" in
    --url)        shift; BASE="${1:-}" ;;
    --sha)        shift; VENTET_SHA="${1:-}" ;;
    --skema)      shift; SKEMA="${1:-}" ;;
    --gulv)       shift; GULV="${1:-}" ;;
    --stille)     STILLE=1 ;;
    # 🔴 `--maskine` findes for prøvens skyld, og det er ikke bekvemmelighed: en mutant der
    #   slukker EEN af de syv kontroller, aendrer ikke exitkoden saa laenge en anden stadig
    #   er roed. Kun taellingen kan se forskel paa »vagten virker« og »vagten virker mindre«.
    --maskine)    MASKINE=1; STILLE=1 ;;
    *) echo "🔴 ukendt flag '$1'." >&2; exit 2 ;;
  esac
  shift
done
[ -n "$BASE" ] || { echo "🔴 --url mangler." >&2; exit 2; }
BASE="${BASE%/}"

TMP="$(mktemp -d "${TMPDIR:-/tmp}/efterkontrol-XXXXXX")"
trap 'rm -rf "$TMP"' EXIT

# 🔴 Cache-bustet er ikke pynt, det er hele forskellen paa at maale serveren og at maale
# Cloudflares hukommelse. Token'et skal vaere unikt PR. KOERSEL: en fast streng ville selv
# have en cache-noegle efter foerste brug, og saa ville anden koersel laese en kopi igen.
CB="ek$(date -u '+%Y%m%d%H%M%S')$$"

# ── Hentningen. Seam, saa proeven kan maale vagten frem for husets tilfaeldige nettilstand.
#   Kontrakt for en seam: `$SK_HENT <url> <ud-fil>` skriver kroppen til ud-filen, printer
#   HTTP-koden paa stdout, og exitter != 0 ved TRANSPORTFEJL (ikke ved en 404, som er et svar).
hent() {  # hent <url> <ud-fil> -> printer http-kode; rc != 0 = transportfejl
  if [ -n "${SK_HENT:-}" ]; then
    "$SK_HENT" "$1" "$2"
    return $?
  fi
  curl -sS --max-time "$TIMEOUT" -o "$2" -w '%{http_code}' "$1"
}

ok=0; fejl=0
sig() { [ -n "$STILLE" ] || printf '%s\n' "$1"; }
groen() { ok=$((ok+1)); sig "  ✅ $1"; }
roed()  { fejl=$((fejl+1)); printf '  ❌ %s\n' "$1" >&2; [ -z "${2:-}" ] || printf '     %s\n' "$2" >&2; }

# 🔴 Hver hentning skelner TRE udfald, og den midterste er den der plejer at blive tabt:
#   transportfejl (vi ved intet) · et svar vi kan laese · et svar med forkert indhold.
#   Et script der slaar de to foerste sammen, melder »nede« naar wifi blinker, og det er den
#   vej en vagt bliver slaaet fra.
kode=""; krop=""
hent_eller_roed() {  # hent_eller_roed <navn> <url> -> saetter kode + krop, rc 1 ved transportfejl
  local navn="$1" url="$2" f="$TMP/krop"
  kode="$(hent "$url" "$f")"
  local rc=$?
  if [ "$rc" -ne 0 ]; then
    roed "$navn: kunne ikke naa serveren (transportfejl, rc=$rc)" "$url"
    return 1
  fi
  krop="$(cat "$f" 2>/dev/null || true)"
  BYTES="$(wc -c < "$f" 2>/dev/null | tr -d ' ')"
  return 0
}

sig "── deploy-efterkontrol mod $BASE ──"

# ── 1. STEMPLET. Hvilken udrulning svarer fladen som?
#   Foerste linje i deploy-sha.txt er den bare SHA. Er SPA-fallbacken i vejen, staar der
#   `<!DOCTYPE html>`, og saa er filen ikke derude, uanset at koden var 200.
FAKTISK_SHA=""
if hent_eller_roed "stempel" "$BASE/deploy-sha.txt?$CB"; then
  FAKTISK_SHA="$(printf '%s\n' "$krop" | sed -n '1p' | tr -d '\r')"
  case "$FAKTISK_SHA" in
    [0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f]*)
      groen "stemplet findes og er en sha: ${FAKTISK_SHA:0:12}" ;;
    *)
      roed "stemplet er ikke en sha (fladen svarer sandsynligvis med SPA-fallback)" \
           "foerste linje: [${FAKTISK_SHA:0:60}]" ;;
  esac
  if [ -n "$VENTET_SHA" ]; then
    if [ "$FAKTISK_SHA" = "$VENTET_SHA" ]; then
      groen "stemplet er den udrulning vi netop lavede"
    else
      roed "fladen svarer med en ANDEN udrulning end den navngivne" \
           "ventet $VENTET_SHA, fik ${FAKTISK_SHA:-<intet>}"
    fi
  fi
fi

# ── 2. FORSIDEN. Findes index.html overhovedet, og er den denne udrulnings?
#   🔴 Det var praecis den her der manglede i 18 timer, mens alt andet saa groent ud.
if hent_eller_roed "forside" "$BASE/?$CB"; then
  if [ "$kode" = "200" ]; then groen "forsiden svarer 200"
  else roed "forsiden svarer $kode" "$BASE/?$CB"; fi
  if [ "${BYTES:-0}" -ge "$GULV" ]; then groen "forsiden har krop ($BYTES bytes)"
  else roed "forsiden er tom eller stump ($BYTES bytes, gulv $GULV)" \
            "en udrulning uden index.html giver praecis det her"; fi
  # Afsender-stemplet i selve siden. Det binder den krop vi lige laeste til den SHA vi
  # udrullede, saa en gammel edge-kopi ikke kan lyve sig groen.
  if [ -n "$VENTET_SHA" ]; then
    case "$krop" in
      *"name=\"mentem-deploy-sha\" content=\"$VENTET_SHA\""*)
        groen "forsidens eget afsender-stempel er vores sha" ;;
      *)
        roed "forsiden baerer IKKE denne udrulnings afsender-stempel" \
             "enten en gammel kopi fra kanten, eller en anden udrulning" ;;
    esac
  fi
fi

# ── 3. KLIENTENS EGEN FORM. Det er den der var doed, og den der aldrig blev proevet.
#   🔴 En query-streng har sin EGEN cache-noegle. Den bare rod kunne svare fra kanten mens
#   denne her ramte origin og fik 404. Derfor er det her den eneste af de tre der ville
#   have fanget nedbruddet 26/7 paa det tidspunkt hvor det skete.
if hent_eller_roed "klientform" "$BASE/?s=$SKEMA&d=14&$CB"; then
  if [ "$kode" = "200" ]; then groen "klientens link svarer 200 (?s=$SKEMA)"
  else roed "klientens link svarer $kode (?s=$SKEMA)" \
            "den bare rod kan sagtens vaere groen samtidig: anden cache-noegle"; fi
  if [ "${BYTES:-0}" -ge "$GULV" ]; then groen "klientens link har krop ($BYTES bytes)"
  else roed "klientens link giver en blank side ($BYTES bytes, gulv $GULV)" \
            "det var praecis symptomet 26/7"; fi
fi

sig ""
# Opgoerelsen skrives FOER exit og i BEGGE udfald: en proeve der kun kan se exitkoden, kan
# ikke skelne en vagt der fanger syv ting fra en der fanger een.
[ -z "$MASKINE" ] || printf 'RESULTAT groenne=%s roede=%s sha=%s\n' "$ok" "$fejl" "${FAKTISK_SHA:-ingen}"
if [ "$fejl" -eq 0 ]; then
  sig "── $ok groenne, 0 roede. Fladen er hel og er ${FAKTISK_SHA:0:12}. ──"
  exit 0
fi
[ -n "$MASKINE" ] || printf '🔴 %s roede af %s kontroller mod %s\n' "$fejl" "$((ok+fejl))" "$BASE" >&2
exit 1
