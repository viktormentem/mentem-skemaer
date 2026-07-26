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
trap 'rm -rf "$STAGING"' EXIT

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

if [ -n "$(git -C "$REPO" status --porcelain)" ]; then
  gate_fejl="træet er URENT"
elif [ -z "$(git -C "$REPO" branch -r --contains "$SHA" 2>/dev/null)" ]; then
  gate_fejl="HEAD ($SHA) findes IKKE på nogen remote"
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
#       null når tagget mangler — forsvarligt hos dem, men det gør en manglende injektion til en
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
antal="$(grep -c 'name="mentem-deploy-sha"' "$INDEX" || true)"
if [ "$antal" -ne 1 ]; then
  echo "🔴 ABORT: index.html har $antal afsender-stempler (mentem-deploy-sha), forventet præcis 1." >&2
  echo "   Sandsynligvis mangler et <head>-element at indsætte tagget efter." >&2
  exit 1
fi
echo "── Afsender-stempel (index.html) ──"
grep 'name="mentem-deploy-' "$INDEX" | sed 's/^[[:space:]]*/  /'

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
npx wrangler pages deploy "$STAGING" --project-name "$PROJECT" --branch "$BRANCH"

echo ""
echo "── VERIFICÉR (uden query-string!): ──"
echo "  curl -s https://skemaer.mycel.dk/$STAMP | head -1     # skal være $SHA"
echo "  (ved preview: curl -s https://<deployment>.$PROJECT.pages.dev/$STAMP | head -1)"
echo "  curl -s https://skemaer.mycel.dk/ | grep -c 'rel=\"icon\"'          # forvent 3"
echo "  curl -s https://skemaer.mycel.dk/mentem-skema-core.js | grep -c vaelgUgeKort   # forvent 2"
echo "  curl -sI https://skemaer.mycel.dk/test/emoji-guard.mjs | grep content-type     # skal være text/html (fallback = ikke lækket)"
