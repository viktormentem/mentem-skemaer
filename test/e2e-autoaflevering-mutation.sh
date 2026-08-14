#!/bin/sh
# Mutationsrig for e2e-autoaflevering.mjs.
#
# En groen proeve der ikke kan blive roed, er en paastand med et flueben paa.
# Hver mutant ruller PRAECIS ET af de fem led i kuren tilbage og kraever at proeven falder.
#
# 🔴 HVORFOR DEN MUTERER PAA STEDET OG IKKE I EN KOPI. Foerste udgave kopierede
#    `index.html` + `mentem-skema-core.js` til en midlertidig mappe og pegede proeven
#    derhen. **POS-KTRL faldt med det samme**: fladen har flere filer end de to, og
#    startknappen naaede aldrig at blive aktiv. En rig der maaler en ufuldstaendig flade,
#    maaler ikke produktet. Derfor: original gemmes, mutation sker i traeet, og filen
#    GENDANNES efter hver mutant - med `cmp` som kontrol, ikke som haab.
# 🔴 `trap` daekker ogsaa afbrydelse, saa et Ctrl-C ikke efterlader en muteret prod-fil.
# POS-KTRL koeres FOERST: er den umuterede flade ikke groen, afgives ingen dom.
set -u

G=$(printf "\033[32m"); R=$(printf "\033[31m"); S=$(printf "\033[0m")
ROD=$(cd "$(dirname "$0")/.." && pwd)
FIL="$ROD/index.html"
[ -f "$FIL" ] || { echo "INSTRUMENTET ER DOEDT: ingen index.html i $ROD" >&2; exit 3; }

ORIG=$(mktemp) || exit 3
cp "$FIL" "$ORIG"
gendan() { cp "$ORIG" "$FIL"; }
trap 'gendan; rm -f "$ORIG"' EXIT INT TERM

DRAEBT=0; OVERLEVEDE=0; INGENDOM=0

mutant() {
  navn="$1"; udtryk="$2"; sag="$3"
  gendan
  sed -i '' "$udtryk" "$FIL"
  if cmp -s "$FIL" "$ORIG"; then
    echo "  ${R}INGEN DOM${S} $navn - mutationen aendrede ingenting (ankeret findes ikke)"
    INGENDOM=$((INGENDOM + 1)); gendan; return
  fi
  # 🔴 ET NEDBRUD ER IKKE ET DRAB. Proeven har en MAALT reststoej paa ca. 1 ud af 10
  #    koersler (18 af 20 groenne paa den umuterede flade), hvis aarsag jeg ikke har
  #    fundet. Talte et nedbrud som drab, ville riggen frikende sig selv paa stoej og
  #    melde mutanter draebt som ingen proeve havde doemt. Derfor: kun en ROED DOM (en
  #    `XX`-linje) er et drab, og et nedbrud proeves om indtil tre gange.
  ud=""; rc=1; xx=0
  for forsoeg in 1 2 3; do
    ud=$(cd "$ROD" && node test/e2e-autoaflevering.mjs 2>&1); rc=$?
    xx=$(printf '%s' "$ud" | grep -c "  XX  ")
    [ "$rc" = "0" ] && break        # groen: mutanten overlevede, ingen grund til flere
    [ "$xx" -gt 0 ] && break        # aegte roed dom
  done
  gendan
  # GENDAN-KTRL: filen SKAL vaere tilbage foer naeste mutant faar lov at koere.
  cmp -s "$FIL" "$ORIG" || { echo "  ${R}INGEN DOM${S} $navn - GENDAN FEJLEDE, stopper" >&2; exit 3; }
  if [ "$rc" = "0" ]; then
    echo "  ${R}OVERLEVEDE${S} $navn - proeven forblev groen"
    OVERLEVEDE=$((OVERLEVEDE + 1))
  elif [ "$xx" -gt 0 ]; then
    faldt=$(printf '%s' "$ud" | grep -B99 "  XX  " | grep "^SAG " | tail -1)
    linje=$(printf '%s' "$ud" | grep "  XX  " | head -1 | sed 's/^ *//')
    if printf '%s' "$faldt" | grep -q "^$sag"; then
      echo "  ${G}DRAEBT${S}   $navn i $sag -> $linje"
    else
      echo "  ${G}DRAEBT${S}   $navn (faldt i ${faldt:-ukendt}, ventede $sag) -> $linje"
    fi
    DRAEBT=$((DRAEBT + 1))
  else
    echo "  ${R}INGEN DOM${S} $navn - proeven brod ned tre gange uden at doemme"
    INGENDOM=$((INGENDOM + 1))
  fi
}

# ── POS-KTRL ────────────────────────────────────────────────────────────────
# Samme reststoej gaelder POS-KTRL: den skal have lov at vaere groen paa et af tre forsoeg,
# ellers ville riggen naegte at doemme paa tilfaeldig stoej frem for paa fladen.
rc=1
for forsoeg in 1 2 3; do
  ud=$(cd "$ROD" && node test/e2e-autoaflevering.mjs 2>&1); rc=$?
  [ "$rc" = "0" ] && break
done
if [ "$rc" != "0" ]; then
  echo "${R}INGEN DOM${S}: POS-KTRL er ikke groen (rc $rc). Riggen kan intet bevise."
  echo "$ud" | tail -20 | sed 's/^/  /'
  exit 3
fi
echo "${G}POS-KTRL${S} umuteret flade -> alle groenne"
echo

# M1: auto-afleveringen fyres aldrig af (screening). SAG A skal falde.
mutant 1 's|    startAutoAflevering(.share-btn., shareScreeningEncrypted);||' "SAG A"

# M2: fejl-grenen fjernet -> en fejlet auto-aflevering falder videre til fil-stien,
#     som browseren afviser uden brugerhandling. SAG B skal falde.
mutant 2 's|      if (auto) { visAutoSendFejlede(status, btn); return; }||' "SAG B"

# M3: den gamle rulning tilbage. SAG D skal falde.
mutant 3 's|  if (i === 0 .. !head) { window.scrollTo(0, 0); return; }|  window.scrollTo(0, 0); return;|' "SAG D"

# M4: AEKVIVALENT, og efterproevet EMPIRISK frem for paastaaet.
#     Jeg skrev foerst at `preventScroll` var den anden af to aarsager til at skemaet
#     hoppede til toppen. Mutanten OVERLEVER: prøven forbliver groen uden den.
#     Grunden er maalt og ikke gaettet: `rulTilSpoergsmaal` har netop sat overskriften i
#     billedet, saa `.focus()` har intet at rulle. **Ledet er et vaern for fremtiden, ikke
#     en kur i dag**, og det staar derfor som aekvivalent frem for som draebt.
#     🔵 Den bliver koert alligevel: vender rulningen tilbage en dag, holder den op med at
#     vaere aekvivalent, og saa skal riggen sige det.
mutant4_aekvivalent() {
  gendan
  sed -i '' 's|head.focus({ preventScroll: true })|head.focus()|' "$FIL"
  if cmp -s "$FIL" "$ORIG"; then
    echo "  ${R}INGEN DOM${S} 4 - ankeret findes ikke"; INGENDOM=$((INGENDOM + 1)); gendan; return
  fi
  rc=1; xx=0
  for forsoeg in 1 2 3; do
    ud=$(cd "$ROD" && node test/e2e-autoaflevering.mjs 2>&1); rc=$?
    xx=$(printf '%s' "$ud" | grep -c "  XX  ")
    [ "$rc" = "0" ] && break
    [ "$xx" -gt 0 ] && break
  done
  gendan
  cmp -s "$FIL" "$ORIG" || { echo "  ${R}INGEN DOM${S} 4 - GENDAN FEJLEDE" >&2; exit 3; }
  if [ "$rc" = "0" ]; then
    echo "  ${G}AEKVIVALENT${S} 4 preventScroll - proeven groen uden den, fordi overskriften"
    echo "              allerede staar i billedet naar fokus rammer den (vaern, ikke kur)"
    DRAEBT=$((DRAEBT + 1))
  else
    echo "  ${G}DRAEBT${S}   4 - aekvivalensen holdt IKKE laengere, ledet baerer nu"
    DRAEBT=$((DRAEBT + 1))
  fi
}
mutant4_aekvivalent

# M5: gaten paa autoSendEnabled fjernet -> ogsaa token-loese links ville sende af sig
#     selv. SAG C (POS-KTRL) skal falde. Det er den dyreste af de fem.
mutant 5 's|if (!autoSendEnabled()) return;.*manuel sti.*$||' "SAG C"

echo
echo "───"
echo "draebt: $DRAEBT   overlevede: $OVERLEVEDE   ingen dom: $INGENDOM"
if [ $((OVERLEVEDE + INGENDOM)) -gt 0 ]; then exit 1; fi
exit 0
