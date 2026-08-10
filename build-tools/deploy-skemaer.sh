#!/usr/bin/env bash
#
# deploy-skemaer.sh — scoped produktions-deploy for mentem-skemaer (Cloudflare Pages: mycel-skemaer).
#
# HVORFOR DETTE SCRIPT (født 2026-07-23, session 22):
#   skemaer.mycel.dk serveres af Cloudflare Pages via DIRECT-UPLOAD (`wrangler pages deploy`),
#   IKKE git-integration. Et git-push/PR-merge til main PUBLICERER derfor INTET — det er kun
#   versions-kilde + CI-gate. Selve deploy sker med wrangler.
#
#   `wrangler pages deploy .` uploader HELE rod-mappen → test/*.mjs, docs/specs, .superpowers/
#   endte offentligt på klient-siden. `.assetsignore` virker IKKE for Pages (det er en
#   Workers-Assets-feature). Derfor: kopiér KUN klient-facing rod-filer til en ren staging-mappe
#   og deploy den. FAIL-CLOSED: kun rod-filer med klient-endelse kommer med; alt i undermapper
#   (docs/ test/ noter/ .superpowers/ .test-evidence/ .git/) + *.md + dotfiles ekskluderes.
#
# HERKOMST-GATEN (tilføjet 2026-07-26 af INFRA, bestilt af AUDIT, ratificeret af MYCEL BUILDER):
#   c2d75f6-hændelsen 25/7 kostede huset en dag: en SHA var udrullet som INGEN klon, intet reflog
#   og ikke GitHub kendte. Det er kendetegnet på en upushet commit der siden forsvandt. Derfor to
#   ting, og de hænger sammen:
#     1. FREMAD: scriptet nægter at udrulle et træ der er urent, eller hvis HEAD ikke findes på
#        nogen remote. Så kan der ikke opstå en udrullet SHA som kun denne maskine har set.
#     2. BAGUD: den udrullede SHA stemples i en statisk fil på siden (/deploy-sha.txt), så
#        spørgsmålet »hvad kører der lige nu« besvares med et curl frem for et dashboard-login.
#   Gaten kan overstyres, men kun ved at NAVNGIVE den præcise SHA:
#        MYCEL_DEPLOY_HERKOMST_GO=<40-cifret sha> bash build-tools/deploy-skemaer.sh
#   En overstyring kan derfor ikke sættes én gang og glemmes, og den skriver sig selv ind i
#   stemplet (`herkomst=OVERSTYRET`), så siden selv indrømmer at den kom fra et uverificeret træ.
#
# BRUG:
#   bash build-tools/deploy-skemaer.sh --dry-run        # byg staging + vis scope, deploy IKKE
#   bash build-tools/deploy-skemaer.sh --preview [navn] # deploy til PREVIEW-gren (rører ikke prod-aliaset)
#   bash build-tools/deploy-skemaer.sh                  # byg staging + deploy til PRODUKTION
#
# NB: deploy kræver wrangler-skriveadgang (Viktors OAuth). Verificér ALTID live UDEN query-string
#     (CF returnerer falske tomme svar for index.html?foo=bar).

set -euo pipefail

PROJECT="mycel-skemaer"
BRANCH="main"                                  # produktions-branch for projektet
STAMP="deploy-sha.txt"                         # rod-fil, endelse .txt er i EXTS nedenfor
REPO="$(cd "$(dirname "$0")/.." && pwd)"
STAGING="$(mktemp -d "${TMPDIR:-/tmp}/sk-deploy-XXXXXX")"
# Wrangler-loggen ligger som SØSKENDE til staging, aldrig inde i den: en fil i staging ville
# blive uploadet til klient-fladen. Den ryddes samme sted som staging, så en tidlig exit ikke
# efterlader den.
trap 'rm -rf "$STAGING" "$STAGING.wrangler.log"' EXIT

DRY_RUN=""
while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY_RUN="1" ;;
    --preview)
      # Enhver gren der IKKE er produktions-grenen giver en preview-URL hos Pages og flytter
      # ALDRIG produktions-aliaset. Navnet må derfor aldrig kunne blive "main".
      case "${2:-}" in
        ""|-*) BRANCH="preview-herkomst" ;;   # et flag er ikke et grennavn
        *)     BRANCH="$2"; shift ;;
      esac
      if [ "$BRANCH" = "main" ]; then
        echo "🔴 ABORT: --preview main er ikke en preview. Vælg et andet grennavn." >&2
        exit 1
      fi
      ;;
    *) echo "🔴 ABORT: ukendt flag '$1'." >&2; exit 1 ;;
  esac
  shift
done

# ── 1. HERKOMST-GATE: fremad. Kører FØR staging bygges, så en afvisning aldrig kan forveksles
#       med en scope-fejl længere nede. ────────────────────────────────────────────────────────
SHA="$(git -C "$REPO" rev-parse HEAD)"
GREN="$(git -C "$REPO" rev-parse --abbrev-ref HEAD)"
HERKOMST="ok"
gate_fejl=""

# 🔴 HERKOMST-REMOTES (skærpet 2026-07-27 af INFRA, efter måling på nedbruddet 26/7):
#   Gaten spurgte oprindeligt kun »findes SHA'en på NOGEN remote«. Det er ikke nok, og prisen
#   blev målt: de to tomme produktions-udrulninger 26/7 kl. 12:20:09Z og 12:22:43Z bar begge
#   `herkomst=ok`, og deres SHA'er findes i dag i NUL af 91 objektlagre på maskinen. De slap
#   igennem på et træf i `backup-private/backup/*`.
#   En backup-remote er ikke en herkomst: dens refs flyttes af automatik, den force-pushes, og
#   den er netop stedet hvor et commit ingen ellers har set, havner. Gaten blev bygget for at
#   gøre »en udrullet SHA ingen kan finde igen« umulig, og en backup-ref gør præcis det muligt.
#   Derfor tæller kun refs under en NAVNGIVEN herkomst-remote. Hold listen smal.
HERKOMST_REMOTES="${MYCEL_HERKOMST_REMOTES:-origin}"

if [ -n "$(git -C "$REPO" status --porcelain)" ]; then
  gate_fejl="træet er URENT"
else
  ref_traef="$(git -C "$REPO" branch -r --contains "$SHA" 2>/dev/null | sed 's/^[ *]*//' || true)"
  findbare="$(printf '%s\n' "$ref_traef" | grep -E "^(${HERKOMST_REMOTES})/" || true)"
  # 🔴 FINDES DEN NAVNGIVNE HERKOMST-REMOTE OVERHOVEDET HER? (tilføjet 30/7 af INFRA, efter
  # SECURITY TERMINALs punkt om MJ). Uden dette spørgsmål har afvisningen ÉN formulering til
  # TO helt forskellige tilstande:
  #   (a) remoten findes, og SHA'en er ikke på den   <- rigtigt at afvise, og til at rette
  #   (b) remoten findes slet ikke i dette repo      <- også rigtigt at afvise, men af en HELT
  #                                                     anden grund, og »commit + push« er så
  #                                                     et råd der ikke kan følges
  # Målt i MJ-25c 30/7: 41 refs, alle under `backup-mirror/`, og `origin` findes ikke. Gaten
  # sagde »findes KUN uden for herkomst-remoten (origin)«, hvilket lyder som om origin fandtes.
  # **Verdikt rigtigt, begrundelse forkert**, og det er præcis den form der lærer folk at
  # overstyre frem for at rette. Samme fejlklasse som reconcile-gatens suite-ben, målt samme
  # formiddag: et værn der siger NO af en grund det ikke har målt.
  # 🔵 `HERKOMST_REMOTES` bruges som grep-alternation og kan bære flere navne adskilt med `|`.
  # Derfor splittes den her, frem for at antage ét navn.
  remotes_her="$(git -C "$REPO" remote 2>/dev/null || true)"
  navngivne_fundet=""
  for _r in $(printf '%s' "$HERKOMST_REMOTES" | tr '|' ' '); do
    if printf '%s\n' "$remotes_her" | grep -qx "$_r"; then
      navngivne_fundet="$navngivne_fundet $_r"
    fi
  done
  if [ -z "$ref_traef" ]; then
    gate_fejl="HEAD ($SHA) findes IKKE på nogen remote"
  elif [ -z "$navngivne_fundet" ]; then
    gate_fejl="herkomst-remoten ($HERKOMST_REMOTES) FINDES IKKE i $(basename "$REPO"). Repoets remotes er: $(printf '%s' "$remotes_her" | tr '\n' ' '). Sæt MYCEL_HERKOMST_REMOTES til en remote der findes, eller giv repoet den remote gaten skal spørge"
  elif [ -z "$findbare" ]; then
    # Sig hvad der FAKTISK blev fundet. Uden det ligner afvisningen en fejl i gaten, og en
    # gate man ikke forstår, bliver overstyret frem for rettet.
    gate_fejl="HEAD ($SHA) findes KUN uden for herkomst-remoten ($HERKOMST_REMOTES): $(printf '%s' "$ref_traef" | tr '\n' ' ')"
  fi
fi

if [ -n "$gate_fejl" ]; then
  if [ "${MYCEL_DEPLOY_HERKOMST_GO:-}" = "$SHA" ]; then
    HERKOMST="OVERSTYRET"
    echo "🟡 HERKOMST OVERSTYRET: $gate_fejl. Du navngav SHA'en, så deployet fortsætter." >&2
    echo "   Stemplet på siden vil sige herkomst=OVERSTYRET." >&2
  else
    echo "🔴 ABORT (herkomst): $gate_fejl." >&2
    echo "   En udrullet SHA som ingen klon kender, kan ikke findes igen. Det var c2d75f6." >&2
    git -C "$REPO" status --short >&2 || true
    echo "   Ret det (commit + push), eller navngiv SHA'en bevidst:" >&2
    echo "     MYCEL_DEPLOY_HERKOMST_GO=$SHA bash build-tools/deploy-skemaer.sh${DRY_RUN:+ --dry-run}" >&2
    exit 3
  fi
fi

# Klient-facing rod-endelser. Nye assets med disse endelser i roden kommer AUTOMATISK med.
EXTS=" html js mjs css png ico svg jpg jpeg webp gif json webmanifest txt woff woff2 "
# Rod-filer der matcher en klient-endelse men ALDRIG må deployes (defensivt, fremtidssikring).
INTERNAL_ROOT=" package.json package-lock.json pnpm-lock.yaml tsconfig.json wrangler.toml .assetsignore "

cd "$REPO"
copied=0
for f in *; do
  [ -f "$f" ] || continue                      # kun rod-FILER — undermapper aldrig medtaget
  case "$INTERNAL_ROOT" in *" $f "*) continue ;; esac
  ext="${f##*.}"
  case "$EXTS" in
    *" $ext "*) cp "$f" "$STAGING/"; copied=$((copied+1)) ;;
  esac
done

# ── 2. AFSENDER-STEMPEL: samme SHA, men i selve siden (bestilt af MYCEL BUILDER 26/7 kl. 19:4x).
#       Siden læser `meta[name="mentem-deploy-sha"]` (index.html) og sender den med i hver
#       aflevering, så en obduktion kan spørge "hvilken udgave udfyldte klienten?".
#       🔴 Hvorfor det ikke er et hent af deploy-sha.txt: et fetch ville 404'e i hver klients
#       browser så længe stemplet ikke er på main, og det ville tabe et kapløb mod en klient der
#       svarer hurtigere end serveren. Et meta-tag koster intet netværk og læses før first paint.
#       🔴 Hvorfor scriptet ABORTERER frem for at springe over: siden sætter selv webDeploySha til
#       null når tagget mangler, forsvarligt hos dem, men det gør en manglende injektion til en
#       TAVS fejl her: deployet lykkes, siden ser rigtig ud, og hver aflevering bærer "vi ved det
#       ikke". Fail-closed er den eneste form hvor et manglende stempel opdages af nogen.
INDEX="$STAGING/index.html"
if [ ! -f "$INDEX" ]; then
  echo "🔴 ABORT: index.html nåede ikke staging. Uden den har siden ingen indgang, og" >&2
  echo "   afsender-stemplet (mentem-deploy-sha) ville mangle i hver eneste aflevering." >&2
  exit 1
fi
# Fjern et evt. eksisterende stempel FØR indsættelsen: to tags ville gøre det vilkårligt hvilken
# SHA `querySelector` giver klienten, og en hånd-holdt værdi må aldrig kunne slå deployets egen.
awk -v sha="$SHA" -v herk="$HERKOMST" '
  /<meta name="mentem-deploy-(sha|herkomst)"/ { next }
  { print }
  !sat && /<head>/ {
    print "<meta name=\"mentem-deploy-sha\" content=\"" sha "\">"
    print "<meta name=\"mentem-deploy-herkomst\" content=\"" herk "\">"
    sat = 1
  }
' "$INDEX" > "$INDEX.ny" && mv -f "$INDEX.ny" "$INDEX"

# TILBAGELÆSNING, ikke en kvittering: tallet og linjerne nedenfor læses ud af den fil der uploades.
#
# 🔴 Mønstret er ankret til at linjen ER et meta-tag (^ + valgfri indrykning), ikke til at den
#    NÆVNER tag-navnet. Uden ankeret tæller gaten sidens egen LÆSER med: index.html indeholder
#    `document.querySelector('meta[name="mentem-deploy-sha"]')` og en kommentar der citerer
#    tagget, og et frit navne-søg finder dem begge. Målt 27/7 kl. 17:2x, da de to grene blev
#    landet sammen: deployet aborterede med »har 2 afsender-stempler« og der var præcis ét.
#    Hver gren var grøn alene. Samme rod som assert_stempel/assert_afsender i prøven blev
#    skærpet for: prosa og kode der omtaler stemplet, er ikke stemplet.
#    Retningen er den dyre: en fail-closed gate der tæller forkert, blokerer et KORREKT deploy
#    og lærer huset at overstyre gaten. Dækket af assert 48-52 (mutant: fjern ankeret => 4 røde).
antal="$(grep -cE '^[[:space:]]*<meta name="mentem-deploy-sha"' "$INDEX" || true)"
if [ "$antal" -ne 1 ]; then
  echo "🔴 ABORT: index.html har $antal afsender-stempler (mentem-deploy-sha), forventet præcis 1." >&2
  echo "   Sandsynligvis mangler et <head>-element at indsætte tagget efter." >&2
  exit 1
fi
echo "── Afsender-stempel (index.html) ──"
grep -E '^[[:space:]]*<meta name="mentem-deploy-' "$INDEX" | sed 's/^[[:space:]]*/  /'

# ── 3. HERKOMST-STEMPEL: bagud. Skrives i STAGING, aldrig i repoet — ellers ville scriptet gøre
#       træet urent og dermed lukke sin egen gate ved næste kørsel.
#       Linje 1 er den BARE SHA, så en maskine kan sammenligne med `head -1`. Resten er til et
#       menneske. Filen er en rod-fil med en tilladt endelse (.txt står i EXTS), og det er ikke
#       en tilfældighed: undermapper, *.md og dotfiles udelades LYDLØST af kopieringen ovenfor,
#       så et stempel i .deploy-sha eller meta/version.txt ville give 404 mens scriptet exitter 0.
printf '%s\n' "$SHA" > "$STAGING/$STAMP"
{
  echo "gren=$GREN"
  echo "pages_branch=$BRANCH"
  echo "herkomst=$HERKOMST"
  echo "utc=$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
} >> "$STAGING/$STAMP"
# NB: $copied tælles IKKE op af stemplet. Ellers ville et repo med 11 klient-filer slippe forbi
# for-få-gaten nedenfor, alene fordi scriptet selv lagde en tolvte fil i mappen.

echo "── Staging-scope: $copied klient-filer + 1 herkomst-stempel ──"
ls -1 "$STAGING" | sort | sed 's/^/  /'
echo "── Herkomst-stempel ($STAMP) ──"
sed 's/^/  /' "$STAGING/$STAMP"

# FAIL-CLOSED sanity-gates
if find "$STAGING" -mindepth 1 \( -name '*.md' -o -name '.*' -o -type d \) | grep -q .; then
  echo "🔴 ABORT: intern fil/mappe sluppet ind i staging (se ovenfor)." >&2
  exit 1
fi
if [ "$copied" -lt 12 ]; then
  echo "🔴 ABORT: kun $copied filer — for få, allowlisten fanger måske ikke en klient-fil. Tjek EXTS." >&2
  exit 1
fi

if [ -n "$DRY_RUN" ]; then
  echo "── DRY-RUN: deployer IKKE. ($copied filer verificeret rene.) ──"
  exit 0
fi

if [ "$BRANCH" = "main" ]; then
  echo "── Deployer til Cloudflare Pages: $PROJECT / branch=$BRANCH (PRODUKTION) ──"
else
  echo "── Deployer til Cloudflare Pages: $PROJECT / branch=$BRANCH (PREVIEW, prod-aliaset røres ikke) ──"
fi
WRLOG="$STAGING.wrangler.log"
set +e
${MYCEL_WRANGLER:-npx wrangler} pages deploy "$STAGING" --project-name "$PROJECT" --branch "$BRANCH" 2>&1 | tee "$WRLOG"
wr_rc="${PIPESTATUS[0]}"
set -e
if [ "$wr_rc" -ne 0 ]; then
  rm -f "$WRLOG"
  echo "🔴 ABORT: wrangler fejlede (rc=$wr_rc). Intet er efterprøvet." >&2
  exit 1
fi

# ── 5. EFTERKONTROL. Eksekveret, ikke foreslået. ─────────────────────────────────────────────
# 🔴 HER STOD FEM `echo`-LINJER FØR 27/7, OG DE KOSTEDE 18 TIMERS NEDETID.
#   De printede hvad et menneske burde køre bagefter, med overskriften »VERIFICÉR (uden
#   query-string!)«. To fejl, og den anden er den dyre:
#     1. Den foreslåede forespørgsel var den bare rod, altså netop den ene cache-nøgle
#        Cloudflare stadig havde et gammelt svar på (`age: 72240`). Alt med `?s=…` ramte
#        origin og fik 404. Rådet pegede på det eneste sted der ikke kunne gå rødt.
#     2. Ingen kørte dem. Scriptet exittede 0 efter at have udskrevet prosa, og en udrulning
#        med ÉN fil i blev derfor stemplet som lykkedes. **En efterprøvning der ikke
#        eksekveres, er ikke en efterprøvning.** Samme klasse som resten af huset lukkede
#        27/7: en erklæring lyder som en kvittering, og ingen gate læser prosa.
#
# 🔴 FAIL-CLOSED PÅ SELVE ADRESSEN: kan URL'en ikke læses ud af wranglers svar, ABORTERER vi.
#   Alternativet ville være at springe kontrollen over med en advarsel, og et spring er
#   præcis den tilstand vi lige har betalt for.
DEPLOY_URL="$(grep -Eo "https://[a-z0-9-]+\.${PROJECT}\.pages\.dev" "$WRLOG" | tail -1 || true)"
rm -f "$WRLOG"
if [ -z "$DEPLOY_URL" ]; then
  echo "🔴 ABORT: kunne ikke læse udrulningens URL ud af wranglers svar." >&2
  echo "   Udrulningen ER sket, men den er UEFTERPRØVET. Kør selv:" >&2
  echo "     bash build-tools/deploy-efterkontrol.sh --url <url> --sha $SHA" >&2
  exit 1
fi

EK="$(dirname "$0")/deploy-efterkontrol.sh"
[ -f "$EK" ] || { echo "🔴 ABORT: finder ikke deploy-efterkontrol.sh ved siden af." >&2; exit 1; }

echo ""
echo "── Efterkontrol 1 af 2: selve udrulningen ($DEPLOY_URL) ──"
# Den udrulnings-specifikke adresse er ny i dette sekund og kan derfor ikke besvares fra en
# gammel kant-kopi. Den måler ét spørgsmål rent: kom filerne overhovedet op?
bash "$EK" --url "$DEPLOY_URL" --sha "$SHA" || {
  echo "🔴 ABORT: udrulningen er ufuldstændig. Prod-aliaset er IKKE efterprøvet." >&2
  exit 1
}

if [ "$BRANCH" != "main" ]; then
  echo ""
  echo "── Preview: prod-aliaset røres ikke, så det efterprøves ikke. ──"
  exit 0
fi

# 🔴 Aliaset skifter ikke i samme sekund som uploaden er færdig. Uden et par forsøg ville
#   kontrollen fyre på et kapløb frem for på en fejl, og en vagt der melder falsk rødt,
#   bliver slået fra. Forsøgene er få og korte: det er propagering, ikke tålmodighed.
FORSOEG="${MYCEL_EFTERKONTROL_FORSOEG:-5}"
PAUSE="${MYCEL_EFTERKONTROL_PAUSE:-6}"
echo ""
echo "── Efterkontrol 2 af 2: produktionsfladen på klientens egen form ──"
n=1
while : ; do
  if bash "$EK" --url "https://skemaer.mycel.dk" --sha "$SHA"; then
    echo ""
    echo "── Udrulning $SHA er EFTERPRØVET fremme, både i udrulningen og på prod. ──"
    exit 0
  fi
  if [ "$n" -ge "$FORSOEG" ]; then
    echo "🔴 ABORT: prod-aliaset svarer stadig forkert efter $n forsøg." >&2
    echo "   Udrulningen selv var hel, så det er aliaset eller kanten. Sidste hele udrulning" >&2
    echo "   kan sættes tilbage med et deploy fra origin/main." >&2
    exit 1
  fi
  echo "   (forsøg $n af $FORSOEG, aliaset er måske ikke skiftet endnu, venter $PAUSE sek)" >&2
  sleep "$PAUSE"
  n=$((n+1))
done
