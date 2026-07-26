#!/usr/bin/env bash
#
# deploy-herkomst-test.sh — fitness function for herkomst-gaten i deploy-skemaer.sh.
#
# HVAD DEN MÅLER, og hvorfor den ikke er et grep:
#   Gaten skal gøre c2d75f6-hændelsen umulig: en udrullet SHA som ingen klon, intet reflog og
#   ikke GitHub kender. Et grep kan se at der STÅR en gate i filen. Kun en kørsel kan vise at
#   den FYRER. Derfor bygger prøven et rigtigt git-repo med en rigtig (bar) remote, lægger det
#   rigtige script ind i det, og kører det. Ingen seams, ingen mocks, ingen deploy.
#
#   `--dry-run` stopper FØR wrangler kaldes, så prøven rører aldrig nettet.
#
# BRUG:  bash build-tools/deploy-herkomst-test.sh
# Exit:  0 = alle asserts grønne, 1 = mindst én rød.

set -uo pipefail

SCRIPT_UNDER_TEST="$(cd "$(dirname "$0")" && pwd)/deploy-skemaer.sh"
[ -f "$SCRIPT_UNDER_TEST" ] || { echo "🔴 finder ikke deploy-skemaer.sh"; exit 1; }

ok=0; fejl=0
assert() {  # assert <navn> <ventet> <faktisk>
  if [ "$2" = "$3" ]; then ok=$((ok+1)); printf '  ✅ %s\n' "$1"
  else fejl=$((fejl+1)); printf '  ❌ %s\n     ventet: [%s]\n     fik   : [%s]\n' "$1" "$2" "$3"; fi
}
assert_har() {  # assert_har <navn> <delstreng> <tekst>
  case "$3" in
    *"$2"*) ok=$((ok+1)); printf '  ✅ %s\n' "$1" ;;
    *) fejl=$((fejl+1)); printf '  ❌ %s\n     fandt ikke: [%s]\n' "$1" "$2" ;;
  esac
}
assert_har_ikke() {
  case "$3" in
    *"$2"*) fejl=$((fejl+1)); printf '  ❌ %s\n     fandt (skulle ikke): [%s]\n' "$1" "$2" ;;
    *) ok=$((ok+1)); printf '  ✅ %s\n' "$1" ;;
  esac
}

TMP="$(mktemp -d "${TMPDIR:-/tmp}/herkomst-test-XXXXXX")"
trap 'rm -rf "$TMP"' EXIT

# ── Fixture: et repo der ligner mentem-skemaer nok til at scriptets egne gates er tilfredse
FIX="$TMP/repo"
BARE="$TMP/origin.git"
mkdir -p "$FIX/build-tools" "$FIX/docs"
cp "$SCRIPT_UNDER_TEST" "$FIX/build-tools/deploy-skemaer.sh"
i=1
while [ "$i" -le 14 ]; do printf '<!-- fil %s -->\n' "$i" > "$FIX/side$i.html"; i=$((i+1)); done
printf 'intern\n' > "$FIX/NOTER.md"
printf 'intern\n' > "$FIX/docs/spec.html"
printf '{}\n' > "$FIX/package.json"
printf '.wrangler/\n' > "$FIX/.gitignore"

git init -q "$BARE" --bare
(
  cd "$FIX"
  git init -q
  git config user.email infra@mycel.dk
  git config user.name INFRA
  git add -A >/dev/null
  git commit -qm "fixture"
  git remote add origin "$BARE"
  git push -q origin HEAD:refs/heads/main
  git fetch -q origin
) || { echo "🔴 kunne ikke bygge fixture"; exit 1; }

koer() {  # koer [flag...] -> sætter UD og RC
  UD="$(cd "$FIX" && env -u MYCEL_DEPLOY_HERKOMST_GO bash build-tools/deploy-skemaer.sh "$@" 2>&1)"
  RC=$?
}
koer_med_go() {  # koer_med_go <sha> [flag...]
  local sha="$1"; shift
  UD="$(cd "$FIX" && MYCEL_DEPLOY_HERKOMST_GO="$sha" bash build-tools/deploy-skemaer.sh "$@" 2>&1)"
  RC=$?
}
SHA() { git -C "$FIX" rev-parse HEAD; }

echo "── deploy-herkomst-test ──"

# 1-4. Rent og pushet træ: gaten slipper igennem, og stemplet bærer den RIGTIGE sha
koer --dry-run
assert "1. rent + pushet træ giver rc 0" "0" "$RC"
assert_har "2. stemplet ligger i staging" "deploy-sha.txt" "$UD"
assert_har "3. stemplets linje 1 er HEADs fulde sha" "$(SHA)" "$UD"
assert_har "4. herkomsten meldes ok" "herkomst=ok" "$UD"

# 5. Stemplet må ikke røre repoet. Gør det det, lukker scriptet sin egen gate næste gang.
assert "5. repoet er stadig rent efter kørslen" "" "$(git -C "$FIX" status --porcelain)"

# 6-8. URENT træ (sporet fil ændret) -> nægtet
printf '<!-- ændret -->\n' >> "$FIX/side1.html"
koer --dry-run
assert "6. urent træ giver rc 3" "3" "$RC"
assert_har "7. urent træ nævner hvorfor" "URENT" "$UD"
assert_har_ikke "8. urent træ når ALDRIG frem til staging-scopet" "Staging-scope" "$UD"
git -C "$FIX" checkout -q -- side1.html

# 9. USPORET fil er også urenhed (fail-closed: en fil ingen kender, kan ikke findes igen)
printf 'x\n' > "$FIX/ny.html"
koer --dry-run
assert "9. usporet fil giver rc 3" "3" "$RC"
rm -f "$FIX/ny.html"

# 10. En fil dækket af .gitignore er IKKE urenhed (ellers ville wranglers egen cache
#     blokere enhver deploy efter den første)
mkdir -p "$FIX/.wrangler/tmp"; printf 'cache\n' > "$FIX/.wrangler/tmp/x"
koer --dry-run
assert "10. gitignoreret cache blokerer ikke" "0" "$RC"

# 11-13. UPUSHET HEAD -> nægtet. Det er præcis c2d75f6-mekanismen.
printf '<!-- ny -->\n' > "$FIX/side15.html"
git -C "$FIX" add -A >/dev/null; git -C "$FIX" commit -qm "upushet"
koer --dry-run
assert "11. upushet HEAD giver rc 3" "3" "$RC"
assert_har "12. upushet HEAD nævner remoten" "findes IKKE på nogen remote" "$UD"
assert_har "13. afvisningen navngiver c2d75f6" "c2d75f6" "$UD"

# 14-16. Overstyring: kun den NAVNGIVNE sha slipper igennem, og siden indrømmer det
koer_med_go "0000000000000000000000000000000000000000" --dry-run
assert "14. overstyring med FORKERT sha nægtes stadig" "3" "$RC"
koer_med_go "$(SHA)" --dry-run
assert "15. overstyring med rigtig sha slipper igennem" "0" "$RC"
assert_har "16. stemplet indrømmer overstyringen" "herkomst=OVERSTYRET" "$UD"

# 17. Pushet igen -> grøn uden overstyring
git -C "$FIX" push -q origin HEAD:refs/heads/main; git -C "$FIX" fetch -q origin
koer --dry-run
assert "17. efter push er gaten grøn igen" "0" "$RC"
assert_har "18. stemplet følger den NYE sha" "$(SHA)" "$UD"

# 19-21. Stemplet skal overleve scriptets EGNE fail-closed-gates og lande som rod-fil
assert_har_ikke "19. stemplet udløser ikke intern-fil-gaten" "ABORT: intern fil" "$UD"
# Tallet UDLEDES af fixturet. Hardkodet fejlede det her assert da fixturet fik to filer mere
# undervejs, og et assert der skal rettes hver gang prøven vokser, bliver slået fra.
FORVENTET="$(ls -1 "$FIX"/*.html 2>/dev/null | wc -l | tr -d ' ')"
assert_har "20. for-få-gaten tæller stemplet FOR SIG ($FORVENTET klient-filer, ikke $((FORVENTET+1)))" \
           "$FORVENTET klient-filer" "$UD"
assert_har "21. dry-run stopper før wrangler" "DRY-RUN: deployer IKKE" "$UD"

# 22-24. Preview må aldrig kunne blive produktion
koer --preview --dry-run
assert "22. --preview uden navn er lovligt" "0" "$RC"
assert_har "23. preview-grenen står i stemplet" "pages_branch=preview-herkomst" "$UD"
koer --preview main --dry-run
assert "24. --preview main afvises" "1" "$RC"

# 25. Et flag er ikke et grennavn (--preview --dry-run må ikke døbe grenen "--dry-run")
koer --preview --dry-run
assert_har_ikke "25. flag opsluges ikke som grennavn" "pages_branch=--dry-run" "$UD"

# 26. Ukendt flag afvises frem for at blive ignoreret
koer --deploy-alt-nu
assert "26. ukendt flag giver rc 1" "1" "$RC"

# 27. Gaten gælder også et rigtigt deploy, ikke kun dry-run (ingen --dry-run: skal stoppe
#     på gaten FØR wrangler nås, så prøven aldrig rører nettet)
printf '<!-- upushet igen -->\n' > "$FIX/side16.html"
git -C "$FIX" add -A >/dev/null; git -C "$FIX" commit -qm "upushet 2"
koer
assert "27. gaten fyrer også uden --dry-run" "3" "$RC"
assert_har_ikke "28. wrangler blev aldrig kaldt" "wrangler pages deploy" "$UD"

echo ""
echo "── $ok grønne, $fejl røde ──"
[ "$fejl" -eq 0 ] || exit 1
