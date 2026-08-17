#!/usr/bin/env bash
# harness-daekning-log.sh · koer daeknings-vagten og GEM raekkerne, saa en flakker
# navngiver sig selv naeste gang den optraeder.
#
# ── HVORFOR DEN FINDES (MYCEL BUILDER 16/8) ──────────────────────────────────
#
# Over elleve koersler gav vagten ti gange ROED 0 og een gang ROED 1. Den ene er
# UNAVNGIVEN, fordi jeg kun greppede SUMMEN den koersel. GROEN var 33 mod 34 og UMAALT
# uaendret 5, saa det var en af de 34 groenne der vippede, men hvilken kan ikke
# genskabes: raekkerne blev aldrig gemt.
#
# 🔴 Problemet var ALDRIG at fejlen er svaer at se. Vagten har haft `--json` hele tiden
# og udsender hver eneste raekke. Jeg smed outputtet vaek. **Et bevis man ikke gemmer,
# er dyrere end et man aldrig maalte, fordi man tror man har det.**
#
# 🔵 Derfor jager denne ikke flakkeren. At fremtvinge den ville kraeve ~32 koersler for
# 95 % sandsynlighed for at se en 1-af-11-haendelse, og de »1 af 11« er et punktestimat
# fra EEN observation. Det er halvanden times maskintid brugt paa et interval der ikke
# kan forsvares. **Billigere at gemme beviset og lade den navngive sig selv.**
#
# 🟡 Og een aerlig mulighed: flakkeren kan allerede vaere umulig. Timeout-drabet der
# blev lukket 16/8 (`ca0a3f5`) optraadte praecis som ROED med TOM aarsagskolonne, og
# den ene tabte koersels aarsag blev aldrig set. Var det den, kan den ikke komme igen.
# Det kan ikke efterproeves, og derfor staar punktet aabent frem for lukket.
#
# Brug:
#   sh build-tools/harness-daekning-log.sh          koer + gem + doem
#   LOG=<sti> sh ...                                anden logsti
#
# rc: vagtens egen (0 ingen roed · 1 mindst een roed · 3 POS-KTRL faldt)
set -u

HER="$(cd "$(dirname "$0")/.." && pwd)"
LOG="${LOG:-$HER/.harness-daekning-historik.jsonl}"

# Tidsstempel tages FOER koerslen, saa en raekke altid kan knyttes til sin start selv
# hvis koerslen doer undervejs.
START="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

UD="$(node "$HER/build-tools/harness-daekning-vagt.mjs" --json 2>/dev/null)"
RC=$?

# 🔴 NAEGT AT SKRIVE EN TOM RAEKKE. En linje med et tomt raekke-saet ville se ud som en
# maaling der fandt ingenting, og det er ikke til at skelne fra en maaling der ikke kunne
# koere. Samme regel som husets rc 3: et doedt instrument afgiver ingen dom.
if [ -z "$UD" ] || ! printf '%s' "$UD" | head -c 1 | grep -q '\['; then
  printf 'UMAALT: vagten gav intet json (rc %s). INTET logget, ingen dom.\n' "$RC" >&2
  exit 3
fi

# Een linje pr. koersel: tidsstempel, rc, og hele raekke-saettet. jsonl frem for json,
# saa filen kan appendes uden at laese den foerst.
printf '{"start":"%s","rc":%s,"raekker":%s}\n' "$START" "$RC" \
  "$(printf '%s' "$UD" | tr -d '\n')" >> "$LOG"

# Kvitteringen NAVNGIVER de ikke-groenne, saa en roed ikke kan forsvinde i en total.
ROEDE="$(printf '%s' "$UD" | node -e '
  let s=""; process.stdin.on("data",d=>s+=d).on("end",()=>{
    const r=JSON.parse(s).filter(x=>x[1]==="ROED");
    console.log(r.length ? r.map(x=>`${x[0]} (rc=${x[2]}) ${x[3]||"INGEN AARSAG SKREVET"}`).join(" · ") : "");
  });')"

if [ -n "$ROEDE" ]; then
  printf '🔴 ROED: %s\n' "$ROEDE" >&2
  printf '   logget i %s\n' "$LOG" >&2
else
  printf 'groen · logget i %s (%s koersler i alt)\n' "$LOG" "$(wc -l < "$LOG" | tr -d ' ')"
fi

exit "$RC"
