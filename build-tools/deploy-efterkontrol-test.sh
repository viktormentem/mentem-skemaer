#!/usr/bin/env bash
#
# deploy-efterkontrol-test.sh - fitness function for efterkontrollen.
#
# 🔴 DEN VIGTIGSTE FIKSTUR ER EN GENSPILNING AF DEN AEGTE HAENDELSE.
#   Scenariet `haendelsen` er ikke opdigtet: det er 26/7 kl. 12:22:43Z, maalt paa
#   `ea2f80e6.mycel-skemaer.pages.dev` inden restoren. `deploy-sha.txt` svarede 200 med 106
#   bytes, og ALT andet svarede 404 med tom krop. Vagten skal gaa ROED paa netop den flade.
#   En vagt der aldrig har fyret paa den skade den er navngivet efter, er ikke maalt.
#
# 🔴 HVORFOR SIGNATUREN ER (rc, groenne, roede, url-log) OG IKKE BARE rc:
#   Efterkontrollen har syv kontroller. En mutant der slukker EEN af dem, aendrer sjaeldent
#   exitkoden, for en anden kontrol er stadig roed. Foerste udgave af den her rig brugte kun
#   rc og »draebte« derfor ingenting. Taellingen ser forskel paa en vagt der virker og en der
#   virker mindre. URL-loggen ser de mutanter der aendrer HVAD der spoerges om: en efterkontrol
#   der holder op med at cache-buste eller holder op med at bruge klientens form, er praecis
#   den fejl der kostede 18 timer, og den ville ellers vaere usynlig for enhver taelling.
#
# BRUG:  bash build-tools/deploy-efterkontrol-test.sh
# Exit:  0 = alle asserts groenne og alle mutanter draebt

set -uo pipefail

HER="$(cd "$(dirname "$0")" && pwd)"
VAGT="$HER/deploy-efterkontrol.sh"
[ -f "$VAGT" ] || { echo "🔴 finder ikke deploy-efterkontrol.sh"; exit 1; }

TMP="$(mktemp -d "${TMPDIR:-/tmp}/ek-test-XXXXXX")"
trap 'rm -rf "$TMP"' EXIT

ok=0; fejl=0
assert() {  # assert <navn> <ventet> <faktisk>
  if [ "$2" = "$3" ]; then ok=$((ok+1)); printf '  ✅ %s\n' "$1"
  else fejl=$((fejl+1)); printf '  ❌ %s\n     ventet: [%s]\n     fik   : [%s]\n' "$1" "$2" "$3"; fi
}
assert_har() {
  case "$3" in
    *"$2"*) ok=$((ok+1)); printf '  ✅ %s\n' "$1" ;;
    *) fejl=$((fejl+1)); printf '  ❌ %s\n     fandt ikke: [%s]\n     i: [%s]\n' "$1" "$2" "$3" ;;
  esac
}

SHA_NY="1111111111111111111111111111111111111111"
SHA_GL="2222222222222222222222222222222222222222"

# ── Seam. Kontrakten er vagtens egen: <url> <ud-fil>, printer HTTP-kode, rc != 0 = transportfejl.
SEAM="$TMP/seam.sh"
cat > "$SEAM" <<'SEAM_SLUT'
#!/usr/bin/env bash
url="$1"; ud="$2"
printf '%s\n' "$url" >> "${EK_LOG:-/dev/null}"
if [ -f "$EK_FIX/transport" ]; then exit 7; fi
case "$url" in
  *deploy-sha.txt*) n=sha ;;
  *"?s="*)          n=query ;;
  *)                n=root ;;
esac
if [ -f "$EK_FIX/$n.body" ]; then cat "$EK_FIX/$n.body" > "$ud"; else : > "$ud"; fi
if [ -f "$EK_FIX/$n.code" ]; then cat "$EK_FIX/$n.code"; else echo 200; fi
SEAM_SLUT
chmod +x "$SEAM"

# ── Fikstur-byggeri
fyld() {  # fyld <sha-i-meta> -> en side over gulvet paa 10 kB
  printf '<!DOCTYPE html>\n<html lang="da">\n<head>\n<meta name="mentem-deploy-sha" content="%s">\n</head>\n<body>\n' "$1"
  i=0; while [ "$i" -lt 400 ]; do printf '<p>linje %s med noget indhold saa siden ligner en rigtig side</p>\n' "$i"; i=$((i+1)); done
  printf '</body>\n</html>\n'
}
lav_fikstur() {  # lav_fikstur <navn>
  mkdir -p "$TMP/fix/$1"; printf '%s' "$1" >/dev/null
}

# 1. `hel`: en fuldstaendig, frisk udrulning
lav_fikstur hel
{ printf '%s\n' "$SHA_NY"; echo "gren=main"; echo "herkomst=ok"; } > "$TMP/fix/hel/sha.body"
fyld "$SHA_NY" > "$TMP/fix/hel/root.body"
cp "$TMP/fix/hel/root.body" "$TMP/fix/hel/query.body"

# 2. `haendelsen`: 26/7 kl. 12:22:43Z, maalt paa den doede udrulning inden restoren.
#    Stemplet var den ENESTE fil derude. Alt andet var 404 med tom krop.
lav_fikstur haendelsen
{ printf '%s\n' "$SHA_NY"; echo "gren=main"; echo "herkomst=ok"; } > "$TMP/fix/haendelsen/sha.body"
: > "$TMP/fix/haendelsen/root.body";  echo 404 > "$TMP/fix/haendelsen/root.code"
: > "$TMP/fix/haendelsen/query.body"; echo 404 > "$TMP/fix/haendelsen/query.code"

# 3. `kant-loegn`: den bare rod svarer fra en 20 timer gammel kant-kopi (200, hel side, GAMMEL
#    sha), mens klientens form rammer origin og faar 404. Det var praecis tilstanden 26/7-27/7,
#    og det er den tilstand det gamle raad (»VERIFICER uden query-string«) kaldte groen.
lav_fikstur kant-loegn
{ printf '%s\n' "$SHA_GL"; echo "gren=main"; } > "$TMP/fix/kant-loegn/sha.body"
fyld "$SHA_GL" > "$TMP/fix/kant-loegn/root.body"
: > "$TMP/fix/kant-loegn/query.body"; echo 404 > "$TMP/fix/kant-loegn/query.code"

# 4. `spa-fallback`: stemplet er vaek, men Pages svarer 200 med index.html i stedet for 404.
#    En kontrol der kun laeser HTTP-koden, ville kalde det groent.
lav_fikstur spa-fallback
fyld "$SHA_NY" > "$TMP/fix/spa-fallback/sha.body"
fyld "$SHA_NY" > "$TMP/fix/spa-fallback/root.body"
cp "$TMP/fix/spa-fallback/root.body" "$TMP/fix/spa-fallback/query.body"

# 5. `transport`: serveren kan ikke naas. Det er IKKE det samme som at fladen er nede.
lav_fikstur transport
touch "$TMP/fix/transport/transport"

koer() {  # koer <fikstur> [flag...] -> saetter RC, UD, MASK, URLLOG
  local fix="$1"; shift
  EK_LOG="$TMP/urls.log"; : > "$EK_LOG"
  UD="$(SK_HENT="$SEAM" EK_FIX="$TMP/fix/$fix" EK_LOG="$EK_LOG" bash "$VAGT" --url https://x.test "$@" 2>&1)"
  RC=$?
  MASK="$(printf '%s\n' "$UD" | sed -n 's/^RESULTAT //p')"
  # CB-token'et er unikt pr. koersel, saa det normaliseres. Det er TILSTEDEVAERELSEN der maales,
  # ikke vaerdien: uden normaliseringen ville signaturen skifte ved hver koersel og vaere ubrugelig.
  URLLOG="$(sed 's/ek[0-9][0-9]*/<CB>/g' "$EK_LOG" | tr '\n' ' ')"
}
sig() { printf '%s|%s|%s' "$RC" "$MASK" "$URLLOG"; }

echo "── deploy-efterkontrol-test ──"

# ── 1-5. Den hele flade
koer hel --maskine --sha "$SHA_NY"
assert "1. en hel udrulning giver rc 0" "0" "$RC"
assert "2. og alle syv kontroller er groenne" "groenne=7 roede=0 sha=$SHA_NY" "$MASK"
assert_har "3. stemplet hentes cache-bustet" "deploy-sha.txt?<CB>" "$URLLOG"
assert_har "4. og klientens EGEN form proeves, ikke kun den bare rod" "?s=soevndagbog&d=14&<CB>" "$URLLOG"
# 🔴 Assert 5 er tilfoejet 27/7 kl. 09:1x efter MYCEL BUILDERs linje »en kur anvendt EET sted er ikke
#    en kur anvendt«. Jeg tog den paa mit eget arbejde og fandt hullet: cache-bustet STOD i alle
#    tre hentninger i vagten, men proeven maalte kun de TO. Forsidens hentning havde hverken
#    assert eller mutant, saa en senere redigering kunne have fjernet den uden at noget gik roedt.
#    Taellingen kunne ikke se det: en hentning uden cache-bust svarer praecis det samme mod en
#    fikstur. Kun URL'en afsloerer det, og kun hvis nogen ser paa den.
assert_har "5. OGSAA forsiden hentes cache-bustet (alle tre, ikke to af tre)" "x.test/?<CB>" "$URLLOG"

# ── 6-8. GENSPILNING AF HAENDELSEN. Det er den positive kontrol: vagten skal fyre paa den
#        praecise flade der stod nede i 18 timer.
koer haendelsen --maskine --sha "$SHA_NY"
assert "6. den doede udrulning 26/7 giver rc 1" "1" "$RC"
assert "7. og fem af syv kontroller er roede" "groenne=2 roede=5 sha=$SHA_NY" "$MASK"
# 🔴 De to groenne er hele pointen: stemplet VAR derude og var korrekt. Et vaern der kun saa
#    paa stemplet, ville have meldt alt vel, praecis som huset gjorde i 18 timer.
koer haendelsen --sha "$SHA_NY"
assert_har "8. meldingen navngiver den blanke side" "blank side" "$UD"

# ── 9-11. Kant-loegnen: den bare rod er groen, klientens form er doed
koer kant-loegn --maskine --sha "$SHA_NY"
assert "9. en gammel kant-kopi paa roden redder ikke fladen" "1" "$RC"
assert "10. forsiden ser hel ud, men sha og klientform er roede" "groenne=3 roede=4 sha=$SHA_GL" "$MASK"
koer kant-loegn --sha "$SHA_NY"
assert_har "11. og den siger at det er en ANDEN udrulning" "ANDEN udrulning" "$UD"

# ── 12-13. SPA-fallback: 200 er ikke et bevis
koer spa-fallback --maskine --sha "$SHA_NY"
assert "12. et 200-svar med index.html i stedet for stemplet afvises" "1" "$RC"
assert "13. praecis de to stempel-kontroller er roede" "groenne=5 roede=2 sha=<!DOCTYPE html>" "$MASK"

# ── 14-16. Transportfejl er ikke det samme som nedetid
koer transport --maskine --sha "$SHA_NY"
assert "14. transportfejl giver rc 1" "1" "$RC"
assert "15. og INGEN kontrol meldes groen paa et svar vi aldrig fik" "groenne=0 roede=3 sha=ingen" "$MASK"
koer transport --sha "$SHA_NY"
assert_har "16. meldingen skelner transportfejl fra en doed flade" "transportfejl" "$UD"

# ── 17-18. Uden --sha er den en ren »hvad koerer der«
koer hel --maskine
assert "17. uden --sha er en hel flade stadig groen" "0" "$RC"
assert "18. og de to sha-sammenligninger springes over" "groenne=5 roede=0 sha=$SHA_NY" "$MASK"

# ── 19. Brugsfejl er ikke det samme som en roed flade. Uden det her kunne en kalder der
#       glemte --url, laese exit 1 som »fladen er nede« og rulle tilbage uden grund.
UD="$(bash "$VAGT" --maskine 2>&1)"; RC=$?
assert "19. manglende --url giver rc 2, ikke rc 1" "2" "$RC"

# ── MUTANTER ─────────────────────────────────────────────────────────────────────────────────
# 🔴 Grundlinjen maales FOERST og AFLEDES, den hardkodes aldrig. En hardkodet grundlinje gjorde
#    i nat en mutant »draebt« fordi mit sed braekkede syntaksen: den doede af at vaere uparsebar,
#    ikke af at blive set. Derfor tre kontroller pr. mutant: cmp (skete mutationen overhovedet),
#    bash -n (er den stadig gyldig kode), og foerst derefter signaturen.
SCENARIER="hel haendelsen kant-loegn spa-fallback transport"
grundlinje() {
  local s alle=""
  for s in $SCENARIER; do koer "$s" --maskine --sha "$SHA_NY"; alle="$alle[$s $(sig)]"; done
  koer hel --maskine; alle="$alle[uden-sha $(sig)]"
  printf '%s' "$alle"
}
ORIG="$TMP/vagt.orig"; cp "$VAGT" "$ORIG"
GRUND="$(grundlinje)"

draebt=0; overlevet=0
mutant() {  # mutant <navn> <sed-udtryk>
  local navn="$1" udtryk="$2"
  sed "$udtryk" "$ORIG" > "$VAGT"
  if cmp -s "$ORIG" "$VAGT"; then
    printf '  ❌ MUTANT %s aendrede INTET (moensteret ramte forbi)\n' "$navn"; fejl=$((fejl+1))
  elif ! bash -n "$VAGT" 2>/dev/null; then
    printf '  ❌ MUTANT %s braekkede syntaksen (nul-mutant, maaler ingenting)\n' "$navn"; fejl=$((fejl+1))
  elif [ "$(grundlinje)" != "$GRUND" ]; then
    printf '  ☠️  MUTANT %s draebt\n' "$navn"; draebt=$((draebt+1))
  else
    printf '  🧟 MUTANT %s OVERLEVEDE\n' "$navn"; overlevet=$((overlevet+1)); fejl=$((fejl+1))
  fi
  cp "$ORIG" "$VAGT"
}

echo ""
echo "── mutanter ──"
mutant "M1 byte-gulvet slukket"        's/-ge "\$GULV"/-ge 0/g'
mutant "M2 sha-sammenligning altid ok" 's/if \[ "\$FAKTISK_SHA" = "\$VENTET_SHA" \]; then/if true; then/'
mutant "M3 afsender-stemplet loesnet"  's/content=\\"\$VENTET_SHA\\"/content=\\"/'
mutant "M4 http-koden loesnet"         's/\[ "\$kode" = "200" \]/[ -n "$kode" ]/g'
mutant "M5 transportfejl ignoreret"    's/if \[ "\$rc" -ne 0 \]; then/if false; then/'
mutant "M6 cache-bust fjernet"         's|\$BASE/deploy-sha.txt?\$CB|$BASE/deploy-sha.txt|'
mutant "M7 klientformen droppet"       's|\$BASE/?s=\$SKEMA&d=14&\$CB|$BASE/?$CB|'
mutant "M8 sha-formen ikke tjekket"    's/\[0-9a-f\]\[0-9a-f\]\[0-9a-f\]\[0-9a-f\]\[0-9a-f\]\[0-9a-f\]\[0-9a-f\]\*)/*)/'
# M9 er tvillingen til M6 og findes fordi M6 ALENE var en halv kur: den fjernede kun
# cache-bustet fra stempel-hentningen. Fjernes det fra FORSIDEN, er skaden den samme.
mutant "M9 cache-bust fjernet fra forsiden" 's|\$BASE/?\$CB|$BASE/|g'

echo ""
echo "── $ok groenne, $fejl roede · $draebt mutanter draebt, $overlevet overlevede ──"
[ "$fejl" -eq 0 ] || exit 1
