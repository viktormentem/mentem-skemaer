#!/bin/bash
#
# install-emoji-guard-hook.sh — deploy .githooks/pre-push => mentem-skemaer/.git/hooks/pre-push
#
# git versionerer IKKE .git/hooks => denne installer er den kanoniske deploy-mekanisme (koer pr.
# klon af mentem-skemaer). Source-of-truth = .githooks/pre-push (git-versioneret i dette repo;
# single-repo guard => kanonisk lever I repoet, lever med koden den beskytter).
#
# Spejlet paa install-release-range-guard.sh (DJ-062-moenster): efter cp verificeres sha256
# live==canonical, saa hook'en aldrig driver fra den versionerede kilde.
#
# Brug:  bash test/install-emoji-guard-hook.sh

set -eu

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SOURCE="$REPO_ROOT/.githooks/pre-push"
HOOKS_DIR="$REPO_ROOT/.git/hooks"
TARGET="$HOOKS_DIR/pre-push"

echo "emoji-guard pre-push-hook — installer"
echo "─────────────────────────────────────────"

# 0. Validér SOURCE.
if [ ! -f "$SOURCE" ]; then echo "❌ Source mangler: $SOURCE"; exit 1; fi
if ! bash -n "$SOURCE"; then echo "❌ Source syntaksfejl: $SOURCE"; exit 1; fi
CANON_SHA="$(shasum -a 256 "$SOURCE" | awk '{print $1}')"
echo "Canonical: $SOURCE"
echo "  sha256:  $CANON_SHA"
echo ""

if [ ! -d "$REPO_ROOT/.git" ]; then
    echo "❌ $REPO_ROOT er ikke et git-repo (.git mangler)."; exit 1
fi
mkdir -p "$HOOKS_DIR"

# Backup en eksisterende NON-guard pre-push (roer ikke en tidligere emoji-guard-kopi).
if [ -f "$TARGET" ] && ! grep -q "emoji-guard" "$TARGET" 2>/dev/null; then
    BAK="${TARGET}.pre-guard-bak-$(date '+%Y%m%dT%H%M%S')"
    cp -p "$TARGET" "$BAK"
    echo "↳ backup af eksisterende pre-push: $BAK"
fi

cp "$SOURCE" "$TARGET"
chmod +x "$TARGET"
LIVE_SHA="$(shasum -a 256 "$TARGET" | awk '{print $1}')"

echo "── $REPO_ROOT/.git/hooks/pre-push"
if [ "$LIVE_SHA" = "$CANON_SHA" ]; then
    echo "   ✅ installeret · sha live==canonical ($LIVE_SHA)"
else
    echo "   ❌ sha MISMATCH efter cp! live=$LIVE_SHA canonical=$CANON_SHA"
    exit 1
fi

echo ""
echo "─────────────────────────────────────────"
echo "✅ Faerdig — emoji-guard pre-push-hook installeret (sha verificeret)."
echo ""
echo "Gate:    roed guard (emoji-som-ikon) => push til main ABORTERES (exit 1)."
echo "Bevidst prosa-emoji:  tilfoej 'emoji-guard:allow: <begrundelse>' paa linjen."
echo "Bevidst bypass (sidste udvej):  git push --no-verify"
