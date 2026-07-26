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
# assert_stempel <navn> <linje> — leder KUN i det udskrevne stempel, ikke i hele uddataen.
# En mutationskørsel fandt hullet: scriptets egen ADVARSEL nævner »herkomst=OVERSTYRET« i prosa,
# så et frit substreng-søg blev grønt selv med et stempel der altid løj og sagde ok.
assert_stempel() {
  local linje
  linje="$(printf '%s\n' "$3" | sed -n '/── Herkomst-stempel/,/^──/p' | sed -n "s/^  //p" | grep -cx "$2")"
  if [ "$linje" -ge 1 ]; then ok=$((ok+1)); printf '  ✅ %s\n' "$1"
  else fejl=$((fejl+1)); printf '  ❌ %s\n     stemplet havde ikke linjen: [%s]\n' "$1" "$2"; fi
}

# assert_afsender <navn> <linje>: leder KUN i afsender-stemplets egen udskrift, af præcis
# samme grund som assert_stempel: scriptets kommentarer og fejltekster nævner selv tag-navnet,
# så et frit substreng-søg ville blive grønt af prosa. Udskriften er en TILBAGELÆSNING af
# staging-filen, ikke en påstand fra scriptet om hvad det mente at skrive.
assert_afsender() {
  local n
  n="$(printf '%s\n' "$3" | sed -n '/── Afsender-stempel/,/^──/p' | sed -n "s/^  //p" | grep -cx "$2")"
  if [ "$n" -ge 1 ]; then ok=$((ok+1)); printf '  ✅ %s\n' "$1"
  else fejl=$((fejl+1)); printf '  ❌ %s\n     afsender-stemplet havde ikke linjen: [%s]\n' "$1" "$2"; fi
}
# assert_afsender_antal <navn> <ventet antal> <moenster> <uddata>
assert_afsender_antal() {
  local n
  n="$(printf '%s\n' "$4" | sed -n '/── Afsender-stempel/,/^──/p' | sed -n 's/^  //p' | grep -c "$3")"
  assert "$1" "$2" "$n"
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
# index.html er IKKE bare en fil mere i fixturet: den er den ENESTE fil afsender-stemplet
# skrives i, og den er derfor både subjekt for assert 29-38 og en helt almindelig klient-fil
# for scope-gaterne ovenfor. Formen matcher den rigtige side: `<head>` på egen linje.
printf '<!DOCTYPE html>\n<html lang="da">\n<head>\n<meta charset="UTF-8">\n</head>\n<body>x</body>\n</html>\n' > "$FIX/index.html"
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
assert_stempel "3. stemplets linje 1 er HEADs fulde sha" "$(SHA)" "$UD"
assert_stempel "4. herkomsten meldes ok" "herkomst=ok" "$UD"

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
assert_stempel "16. stemplet indrømmer overstyringen" "herkomst=OVERSTYRET" "$UD"

# 17. Pushet igen -> grøn uden overstyring
git -C "$FIX" push -q origin HEAD:refs/heads/main; git -C "$FIX" fetch -q origin
koer --dry-run
assert "17. efter push er gaten grøn igen" "0" "$RC"
assert_stempel "18. stemplet følger den NYE sha" "$(SHA)" "$UD"

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
assert_stempel "23. preview-grenen står i stemplet" "pages_branch=preview-herkomst" "$UD"
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

# ── 29-38. AFSENDER-STEMPLET I index.html (MYCEL BUILDERs bestilling 26/7 kl. 19:4x) ──────────
#   Deres side læser `document.querySelector('meta[name="mentem-deploy-sha"]')` (index.html:608
#   på feat/afsender-stempel-2026-07-26) og sætter webDeploySha = null hvis tagget mangler.
#   Null er FORSVARLIGT for dem, de gætter aldrig en SHA, men det gør en manglende injektion
#   til en TAVS fejl her hos os: deployet ville lykkes, siden ville se rigtig ud, og hver
#   aflevering ville bære "vi ved det ikke". Derfor måler prøven ikke om koden findes, men om
#   tagget står i den fil der faktisk uploades, og at scriptet ABORTERER hvis det ikke gør.
git -C "$FIX" push -q origin HEAD:refs/heads/main; git -C "$FIX" fetch -q origin
koer --dry-run
assert "29. med index.html er kørslen stadig grøn" "0" "$RC"
assert_afsender "30. staging-index bærer deployets EGEN sha" \
                "<meta name=\"mentem-deploy-sha\" content=\"$(SHA)\">" "$UD"
assert_afsender "31. herkomsten står med på siden" \
                '<meta name="mentem-deploy-herkomst" content="ok">' "$UD"
assert_afsender_antal "32. præcis ÉT sha-tag (to ville gøre querySelector vilkårlig)" \
                      "1" 'mentem-deploy-sha' "$UD"

# 33-34. Repoets egen index.html må ALDRIG røres, samme grund som deploy-sha.txt: et script
#        der gør sit eget træ urent, lukker sin egen herkomst-gate ved næste kørsel.
assert "33. repoet er rent efter injektionen" "" "$(git -C "$FIX" status --porcelain)"
assert_har_ikke "34. kildens index.html har intet stempel" "mentem-deploy-sha" "$(cat "$FIX/index.html")"

# 35. Et deploy fra et uverificeret træ skal kunne genkendes i klientens data bagefter,
#     ikke kun i vores egen terminal.
printf '<!-- upushet -->\n' > "$FIX/side17.html"
git -C "$FIX" add -A >/dev/null; git -C "$FIX" commit -qm "upushet 3"
koer_med_go "$(SHA)" --dry-run
assert_afsender "35. overstyring indrømmes også PÅ SIDEN" \
                '<meta name="mentem-deploy-herkomst" content="OVERSTYRET">' "$UD"
git -C "$FIX" push -q origin HEAD:refs/heads/main; git -C "$FIX" fetch -q origin

# 36. Et allerede stemplet index (fx en kilde nogen har hånd-redigeret) må give ÉT tag, og det
#     skal være deployets. Ellers afgør dokumentrækkefølgen hvilken SHA klienten rapporterer.
printf '<!DOCTYPE html>\n<html lang="da">\n<head>\n<meta name="mentem-deploy-sha" content="ffffffffffffffffffffffffffffffffffffffff">\n</head>\n<body>x</body>\n</html>\n' > "$FIX/index.html"
git -C "$FIX" add -A >/dev/null; git -C "$FIX" commit -qm "haandholdt stempel"
git -C "$FIX" push -q origin HEAD:refs/heads/main; git -C "$FIX" fetch -q origin
koer --dry-run
assert_afsender_antal "36. et hånd-holdt stempel erstattes, ikke fordobles" \
                      "1" 'mentem-deploy-sha' "$UD"
assert_afsender "37. og det tilbageværende er deployets sha" \
                "<meta name=\"mentem-deploy-sha\" content=\"$(SHA)\">" "$UD"

# 38-40. FAIL-CLOSED. Den farlige tilstand er ikke en fejl, det er en TAVS no-op: intet <head>
#        at sætte tagget efter ⇒ siden deployes uden stempel og ser fuldkommen normal ud.
printf '<!DOCTYPE html>\n<html><body>ingen head</body></html>\n' > "$FIX/index.html"
git -C "$FIX" add -A >/dev/null; git -C "$FIX" commit -qm "uden head"
git -C "$FIX" push -q origin HEAD:refs/heads/main; git -C "$FIX" fetch -q origin
koer --dry-run
assert "38. index.html uden <head> afvises frem for at deploye ustemplet" "1" "$RC"
# 🔴 39 er IKKE en pyntelig tilføjelse til 38, den er den eneste af de to der måler vagten.
# Mutant 2 (aborten blødt op til `if false`) lod 38 stå GRØN: scriptet døde alligevel med rc 1,
# fordi tilbagelæsningens `grep` ikke fandt noget og `set -e` slog det ihjel. Rigtig exitkode,
# forkert grund. Kun 39, som læser fejlteksten, kunne se forskel. Fjern den ikke.
assert_har "39. afvisningen navngiver stemplet" "mentem-deploy-sha" "$UD"
assert_har_ikke "40. og den når ALDRIG frem til dry-run-kvitteringen" "DRY-RUN: deployer IKKE" "$UD"

# 41. Ingen index.html overhovedet: siden har ingen indgang, og et stempel ingen kan læse.
rm -f "$FIX/index.html"
git -C "$FIX" add -A >/dev/null; git -C "$FIX" commit -qm "uden index"
git -C "$FIX" push -q origin HEAD:refs/heads/main; git -C "$FIX" fetch -q origin
koer --dry-run
assert "41. manglende index.html afvises" "1" "$RC"

echo ""
echo "── $ok grønne, $fejl røde ──"
[ "$fejl" -eq 0 ] || exit 1
