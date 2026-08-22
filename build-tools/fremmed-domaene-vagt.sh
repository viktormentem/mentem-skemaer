#!/usr/bin/env bash
#
# fremmed-domaene-vagt.sh — er der stadig fremmede værter på vores Pages-projekt?
#
# 🔴 HVORFOR DEN FINDES (Viktor-spørgsmål 15/8: »hvordan ved du om svaret kommer når du er
# gået i stå?«). Den åbne sag var: `svar.mycel.dk` er MJ BUILDERs klient-svar-vært, men den
# hænger på VORES Cloudflare Pages-projekt og serverer derfor vores app. Kuren ligger hos
# MJ BUILDER (hvor skal den pege hen) og INFRA (hånden på dashboardet).
#
# 🔵 OG DET ER PRÆCIS DERFOR EN BESKED IKKE KAN LUKKE DEN: ingen af de to skylder OS et
# svar. Venter man på post, venter man på noget der aldrig blev lovet. Huset har allerede
# reglen for det: **mål verden, ikke rapporten om verden.** Denne vagt spørger fladen selv.
#
# Den kan køres af hvem som helst, når som helst, og den kræver ingen hukommelse om sagen:
#   sh build-tools/fremmed-domaene-vagt.sh
#
# rc 0  ingen fremmed vært serverer vores app længere  ->  sagen er lukket, fjern vagten
# rc 1  mindst én fremmed vært serverer stadig vores app -> sagen er åben
# rc 3  UMÅLT (netværk, dødt instrument)               ->  ingen dom, og det siges højt
#
# ─────────────────────────────────────────────────────────────────────────────────────────
# 🔴 RETTET 19/8 (MYCEL BUILDER), og fejlen var at vagten IKKE KUNNE NÅ SIN EGEN rc 0.
#
# INFRA meldte 18/8 at sammenfatningen »2 af 2« talte forkert. Det holdt, men årsagen lå et
# lag dybere, og den var min egen: **jeg formtestede MIN egen sha (l.32-35 i den gamle fil)
# og formtestede ikke det jeg målte.** `hent_sha` tog første linje af HVAD SOM HELST der kom
# tilbage med rc 0. En Pages-vært serverer sin SPA-fallback for enhver ukendt sti, så
# `/deploy-sha.txt` gav 67 KB HTML, og `<!DOCTY` blev læst som »en ANDEN sha«.
#
# To følger, og den anden er den dyre:
#   1. Grenen »svarer, men uden vores stempel -> Lukket« var STRUKTURELT UNÅELIG for enhver
#      Pages-vært, fordi den krævede en TOM streng og en SPA-fallback aldrig er tom.
#      Grenen skrevet til præcis dette tilfælde kunne aldrig fyre.
#   2. `else`-grenen lagde til `aabne`, mens dens egen tekst sagde at værten IKKE var vores.
#
# ⇒ Vagten kunne kun stå på rc 1. **En vagt hvis eneste formål er at fortælle huset hvornår
# den selv skal slettes, var bygget ude af stand til at sige det.** Målt 19/8: begge værter
# talt som åbne, hvoraf den ene var flyttet 17/8.
#
# 🟢 DEN NÅL DER FAKTISK AFGØR SAGEN, er `meta[name="mentem-deploy-sha"]` i selve siden
# (jeg bestilte den selv 26/7; `deploy-skemaer.sh` aborterer hvis den ikke kan stemples, så
# dens fravær på en vært der VAR vores, ville være en husbred fejl og ikke en tavs miss).
# Den overlever at stempel-FILEN falder tilbage til HTML, og den bærer en sha frem for et
# navn. Målt 19/8: skemaer `3fa4f78` · overblik `3fa4f78` · svar INGEN.
#
# 🔵 Og formtesten `er_sha` POS/NEG-kontrolleres nu FØR den bruges til noget, uden netværk.
#
# 🟡 GRÆNSEN FOR BEVISET, skrevet ud så ingen læser mere ud af det (mutationsprøvet 19/8,
# hver mutant kørt alene, filen cmp-identisk bagefter):
#   er_sha svækket til den gamle præfiks-form   -> rc 3 på selvtesten
#   meta-nålens attribut forvansket             -> rc 3 på POS-KTRL'en (var rc 0 »slet vagten« før den)
#   HELE meta-ARMEN fjernet                     -> rc 0 »slet denne vagt« om en ÅBEN sag
# ⇒ **POS-KTRL'en dækker NÅLEN, ikke GRENEN.** Fjerner nogen `elif [ -n "$meta" ]`, findes der
# ingen kontrol der opdager det, og udfaldet er det værst mulige falske grønne. Det er ikke
# lukket her, fordi kuren ville være en selvtest der kalder rækkelogikken mod fiksturer, og
# det er en større ombygning end fejlen retfærdiggør. Det står her frem for at se dækket ud.
#
# 🔵 Og for præcisionens skyld: den gamle vagts DOM var rigtig (rc 1, sagen ER åben) mens
# BEGGE dens tal var forkerte. `overblik` blev læst korrekt fordi den har en ægte stempel-fil;
# `svar` blev læst forkert; og »2 af 2« ramte den rigtige rc af en forkert grund.
# **En rigtig dom er ikke et bevis for de tal den hviler på.**
# ─────────────────────────────────────────────────────────────────────────────────────────
set -u

VORES="https://skemaer.mycel.dk"
FREMMEDE="svar.mycel.dk overblik.mycel.dk"
G=$'\033[32m'; R=$'\033[31m'; Y=$'\033[33m'; S=$'\033[0m'

# 🔴 ÉN formtest, brugt af BEGGE arme. Stod den to steder, ville kun den ene gå rød — det er
# husets 13/8-fejl (en liste i to filer), og det var netop den drift der skabte fejlen her:
# vores egen sha var formtestet, de fremmede var ikke.
er_sha() {
  case "$1" in
    *[!0-9a-f]*) return 1 ;;   # noget der ikke er hex -> ikke en sha, uanset hvor den kom fra
    ???????*)    return 0 ;;   # mindst 7 hex-tegn
    *)           return 1 ;;   # tom eller for kort
  esac
}

# 🔴 INSTRUMENT-KONTROL PÅ FORMTESTEN SELV, før den bruges. Koster intet netværk, og den er
# altid tændt: en selvtest man skal huske at køre, er en selvtest der ikke kører.
instrument_doedt() { printf '%sUMÅLT%s  er_sha() fejler sin egen %s-kontrol (%s). Ingen dom.\n' "$Y" "$S" "$1" "$2" >&2; exit 3; }
er_sha 3fa4f7821c2dfab359fc0b1fb64eb0f5dc379cdb || instrument_doedt POS "fuld sha"
er_sha 3fa4f78                                  || instrument_doedt POS "kort sha"
er_sha '<!DOCTY'                                && instrument_doedt NEG "SPA-fallback"
er_sha ''                                       && instrument_doedt NEG "tom streng"
er_sha 'deadbeefXX'                             && instrument_doedt NEG "hex med skidt i"
er_sha '3fa4f7'                                 && instrument_doedt NEG "for kort"

# 🔵 STIEN ER EN SAEM, og grunden er hele denne rettelses laere: meta-armen nedenfor kunne
# ikke fyres, fordi drift lige nu leverer en brugbar stempel-fil fra begge vores egne vaerter.
# En arm der aldrig har fyret, er en uproevet arm - det var praecis den tilstand fejlen levede i.
# Peger man saemen paa en sti der ikke findes, falder enhver Pages-vaert tilbage til sin SPA,
# hvilket ER den virkelige tilstand armen findes for.
FREMMED_STI="${VAGT_FREMMED_STEMPEL_STI:-deploy-sha.txt}"
hent_stempelfil() { curl -fsS --max-time 20 "https://$1/${2:-deploy-sha.txt}" 2>/dev/null | head -1 | tr -d '[:space:]'; }
hent_meta()       { printf '%s' "$1" | grep -o 'name="mentem-deploy-sha" content="[0-9a-f]*"' | head -1 | sed -e 's/.*content="//' -e 's/"$//'; }

vores_sha="$(hent_stempelfil "${VORES#https://}")"

# 🔴 Kan vi ikke læse VORES egen sha, kan intet sammenlignes, og en tom streng ville ellers
# matche en tom streng og give et falsk »ens«. Nægt at dømme.
er_sha "$vores_sha" || { printf '%sUMÅLT%s  kunne ikke læse vores egen deploy-sha fra %s. Ingen dom.\n' "$Y" "$S" "$VORES"; exit 3; }

# 🔴 POS-KTRL PAA META-NAALEN, paa VORES EGEN flade, foer dens fravaer andre steder betyder noget.
# Uden den er `hent_meta` enearving til rc 0: mutationsproevet 19/8 gav en forvansket
# attribut »LUKKET, slet denne vagt« om en aaben sag - det vaerst mulige falske groenne.
# Huset har reglen: et nul fra en doed naal er ikke til at skelne fra det gode nul.
vores_meta="$(hent_meta "$(curl -fsS --max-time 20 "$VORES/" 2>/dev/null)")"
er_sha "$vores_meta" || { printf '%sUMÅLT%s  meta-naalen (mentem-deploy-sha) finder intet paa VORES egen flade. Ingen dom.\n' "$Y" "$S"; exit 3; }

printf 'vores flade %s = %s (stempel-fil) / %s (meta i siden)\n' "$VORES" "${vores_sha:0:7}" "${vores_meta:0:7}"

aabne=0; lukkede=0; umaalte=0; maalte=0
for v in $FREMMEDE; do
  txt="$(hent_stempelfil "$v" "$FREMMED_STI")"
  rod="$(curl -fsS --max-time 20 "https://$v/" 2>/dev/null)"; rc_rod=$?
  meta="$(hent_meta "$rod")"

  if er_sha "$txt" && [ "$txt" = "$vores_sha" ]; then
    printf '  %s%-22s serverer STADIG vores app (%s). Sagen er aaben.%s\n' "$R" "$v" "${txt:0:7}" "$S"
    aabne=$((aabne + 1)); maalte=$((maalte + 1))
  elif er_sha "$txt"; then
    # 🔴 En ANDEN hex-sha er IKKE en frimelding: stempel-filen er VORES format, så værten
    # står stadig på vores projekt, bare på en ældre udrulning.
    printf '  %s%-22s serverer VORES stempel-fil paa en AELDRE sha (%s). Sagen er aaben.%s\n' "$R" "$v" "${txt:0:7}" "$S"
    aabne=$((aabne + 1)); maalte=$((maalte + 1))
  elif [ -n "$meta" ]; then
    # Stempel-FILEN svarede ikke med en sha (SPA-fallback), men siden selv bærer vores
    # afsender-stempel. Det er den nål der overlever fallbacken.
    printf '  %s%-22s ingen brugbar stempel-fil, men siden baerer VORES stempel (%s). Sagen er aaben.%s\n' "$R" "$v" "${meta:0:7}" "$S"
    aabne=$((aabne + 1)); maalte=$((maalte + 1))
  elif [ "$rc_rod" -eq 0 ]; then
    printf '  %s%-22s SVARER, uden vores stempel nogen af de to steder -> serverer noget ANDET. Lukket.%s\n' "$G" "$v" "$S"
    lukkede=$((lukkede + 1)); maalte=$((maalte + 1))
  else
    printf '  %s%-22s UMAALT: hverken stempel-fil eller svar paa roden (nede? TLS? flyttet midt i?)%s\n' "$Y" "$v" "$S"
    umaalte=$((umaalte + 1))
  fi
done

# 🔴 POS-KTRL paa vagten selv: maalte vi overhovedet nogen? En loekke over nul vaerter ville
# falde ud som »0 aabne« og laese som en frimelding.
[ "$maalte" -gt 0 ] || { printf '%sUMÅLT%s  ingen af de %d fremmede vaerter kunne maales. Ingen dom.\n' "$Y" "$S" "$umaalte"; exit 3; }

# 🔵 ENHEDEN STAAR VED TALLET (INFRA 18/8): »2 af 2« havde ingen enhed, og 2 af 2 VAERTER var
# sandt mens 2 af 2 AABNE SAGER var falsk. Alle tre spande skrives ud, saa summen kan efterproeves.
if [ "$aabne" -eq 0 ]; then
  printf '%sLUKKET%s  0 af %d maalte vaerter serverer vores app (%d lukket, %d umaalt). Slet denne vagt.\n' \
    "$G" "$S" "$maalte" "$lukkede" "$umaalte"
  exit 0
fi
printf '%sAABEN%s  %d af %d maalte vaerter haenger stadig paa vores Pages-projekt (%d lukket, %d umaalt).\n' \
  "$R" "$S" "$aabne" "$maalte" "$lukkede" "$umaalte"
printf '        Kuren er MJ BUILDERs (hvor skal den pege hen) + INFRAs (dashboardet).\n'
printf '        🔴 Fjern IKKE domaenet foer destinationen er klar: INFRA maalte 9/8 at det\n'
printf '        giver en TLS-handshake-fejl, ikke en 404. En certifikatadvarsel paa et\n'
printf '        klient-link med helbredsdata er den daarligst mulige fejl.\n'
exit 1
