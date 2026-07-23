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
# BRUG:
#   bash build-tools/deploy-skemaer.sh --dry-run   # byg staging + vis scope, deploy IKKE
#   bash build-tools/deploy-skemaer.sh             # byg staging + deploy til PRODUKTION
#
# NB: deploy kræver wrangler-skriveadgang (Viktors OAuth). Verificér ALTID live UDEN query-string
#     (CF returnerer falske tomme svar for index.html?foo=bar).

set -euo pipefail

PROJECT="mycel-skemaer"
BRANCH="main"                                  # produktions-branch for projektet
REPO="$(cd "$(dirname "$0")/.." && pwd)"
STAGING="$(mktemp -d "${TMPDIR:-/tmp}/sk-deploy-XXXXXX")"
trap 'rm -rf "$STAGING"' EXIT

DRY_RUN=""
[ "${1:-}" = "--dry-run" ] && DRY_RUN="1"

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

echo "── Staging-scope: $copied klient-filer ──"
ls -1 "$STAGING" | sort | sed 's/^/  /'

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

echo "── Deployer til Cloudflare Pages: $PROJECT / branch=$BRANCH (PRODUKTION) ──"
npx wrangler pages deploy "$STAGING" --project-name "$PROJECT" --branch "$BRANCH"

echo ""
echo "── VERIFICÉR (uden query-string!): ──"
echo "  curl -s https://skemaer.mycel.dk/ | grep -c 'rel=\"icon\"'          # forvent 3"
echo "  curl -s https://skemaer.mycel.dk/mentem-skema-core.js | grep -c vaelgUgeKort   # forvent 2"
echo "  curl -sI https://skemaer.mycel.dk/test/emoji-guard.mjs | grep content-type     # skal være text/html (fallback = ikke lækket)"
