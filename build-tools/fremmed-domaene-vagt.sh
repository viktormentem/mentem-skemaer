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
# rc 0  fremmed vært serverer IKKE længere vores app  ->  sagen er lukket, fjern vagten
# rc 1  fremmed vært serverer stadig vores app        ->  sagen er åben, uændret
# rc 3  UMÅLT (netværk, ingen sha, ingen af delene)   ->  ingen dom, og det siges højt
set -u

VORES="https://skemaer.mycel.dk"
FREMMEDE="svar.mycel.dk overblik.mycel.dk"
G=$'\033[32m'; R=$'\033[31m'; Y=$'\033[33m'; S=$'\033[0m'

hent_sha() { curl -fsS --max-time 20 "https://$1/deploy-sha.txt" 2>/dev/null | head -1 | tr -d '[:space:]'; }

vores_sha="$(hent_sha "${VORES#https://}")"

# 🔴 INSTRUMENT-KONTROL FØRST. Kan vi ikke læse VORES egen sha, kan intet sammenlignes, og
# en tom streng ville ellers matche en tom streng og give et falsk »ens«. Nægt at dømme.
case "$vores_sha" in
  [0-9a-f][0-9a-f][0-9a-f][0-9a-f]*) : ;;
  *) printf '%sUMÅLT%s  kunne ikke læse vores egen deploy-sha fra %s. Ingen dom.\n' "$Y" "$S" "$VORES"; exit 3 ;;
esac
printf 'vores flade %s = %s\n' "$VORES" "${vores_sha:0:7}"

aabne=0; maalte=0
for v in $FREMMEDE; do
  sha="$(hent_sha "$v")"
  maalte=$((maalte + 1))
  if [ -z "$sha" ]; then
    # Ingen sha kan betyde to ting: værten er flyttet væk fra os (godt), eller den er nede
    # /uden svar (umålt). Vi skelner på om noget overhovedet svarer.
    if curl -fsS --max-time 20 -o /dev/null "https://$v/" 2>/dev/null; then
      printf '  %s%-22s SVARER, men uden vores deploy-sha -> serverer noget ANDET. Lukket.%s\n' "$G" "$v" "$S"
    else
      printf '  %s%-22s UMÅLT: hverken sha eller svar (nede? TLS? flyttet midt i?)%s\n' "$Y" "$v" "$S"
      maalte=$((maalte - 1))
    fi
  elif [ "$sha" = "$vores_sha" ]; then
    printf '  %s%-22s serverer STADIG vores app (%s). Sagen er aaben.%s\n' "$R" "$v" "${sha:0:7}" "$S"
    aabne=$((aabne + 1))
  else
    printf '  %s%-22s har en ANDEN sha (%s) -> ikke vores nuvaerende udrulning.%s\n' "$Y" "$v" "${sha:0:7}" "$S"
    aabne=$((aabne + 1))
  fi
done

# 🔴 POS-KTRL paa vagten selv: maalte vi overhovedet nogen? En loekke over nul vaerter
# ville falde ud som »0 aabne« og laese som en frimelding.
[ "$maalte" -gt 0 ] || { printf '%sUMÅLT%s  ingen af de fremmede vaerter kunne maales. Ingen dom.\n' "$Y" "$S"; exit 3; }

if [ "$aabne" -eq 0 ]; then
  printf '%sLUKKET%s  ingen fremmed vaert serverer vores app laengere. Slet denne vagt.\n' "$G" "$S"
  exit 0
fi
printf '%sAABEN%s  %d af %d fremmede vaerter haenger stadig paa vores Pages-projekt.\n' "$R" "$S" "$aabne" "$maalte"
printf '        Kuren er MJ BUILDERs (hvor skal den pege hen) + INFRAs (dashboardet).\n'
printf '        🔴 Fjern IKKE domaenet foer destinationen er klar: INFRA maalte 9/8 at det\n'
printf '        giver en TLS-handshake-fejl, ikke en 404. En certifikatadvarsel paa et\n'
printf '        klient-link med helbredsdata er den daarligst mulige fejl.\n'
exit 1
