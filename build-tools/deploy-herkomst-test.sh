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
# 🔴 GATENS SØSKENDE SKAL MED. Deploy-scriptet kalder `rotations-vagt.sh` som en sibling;
# uden den giver kopien rc 127 og HVER assertion herunder bliver rød af en grund der intet
# har med herkomst at gøre. Målt 23/8: 19 assertions faldt af netop det.
# 🔵 Vagten selv opdager at fixturet ikke er skema-træet (ingen mentem-skema-core.js) og
# svarer rc 0 »intet at dømme«, så den rører hverken nettet eller dommen her.
cp "$(dirname "$SCRIPT_UNDER_TEST")/rotations-vagt.sh" "$FIX/build-tools/rotations-vagt.sh"
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

# ── 42-47. EN BACKUP-REMOTE ER IKKE EN HERKOMST (INFRA 27/7, efter 18 timers nedetid) ────────
#   🔴 Instansen, målt: produktions-udrulningerne `c34fcef1` (12:20:09Z) og `ea2f80e6`
#   (12:22:43Z) den 26/7 bar begge `herkomst=ok`. Deres SHA'er `0541324` og `0816831` findes
#   i dag i NUL af 91 objektlagre under ~/Documents/MEMTEM (`cat-file -e`, som også ser
#   uopnåelige objekter; positiv kontrol i samme løkke: `0f12cad` findes i 2). De slap
#   igennem fordi `git branch -r --contains` fandt dem på `backup-private/backup/*`.
#   🔴 Hvorfor det er en rigtig fejl og ikke en formalitet: backup-refs flyttes af automatik
#   og force-pushes. Et commit der KUN findes dér, er præcis det commit ingen har set, og
#   det er hele den hændelse gaten blev skrevet for at gøre umulig.
#   Prøven bygger derfor en RIGTIG anden bar remote og skubber kun dertil.
BARE_BACKUP="$TMP/backup-private.git"
git init -q "$BARE_BACKUP" --bare
git -C "$FIX" remote add backup-private "$BARE_BACKUP"

# Bring fixturet tilbage til en deploybar tilstand (assert 41 slettede index.html)
printf '<!DOCTYPE html>\n<html lang="da">\n<head>\n<meta charset="UTF-8">\n</head>\n<body>x</body>\n</html>\n' > "$FIX/index.html"
git -C "$FIX" add -A >/dev/null; git -C "$FIX" commit -qm "kun paa backup"
git -C "$FIX" push -q backup-private HEAD:refs/heads/backup/main
git -C "$FIX" fetch -q --all

koer --dry-run
assert "42. en sha der KUN findes på backup-remoten, afvises" "3" "$RC"
assert_har "43. afvisningen navngiver herkomst-remoten" "uden for herkomst-remoten" "$UD"
assert_har "44. og siger hvad den FAKTISK fandt" "backup-private/backup/main" "$UD"
assert_har_ikke "45. den når aldrig frem til staging" "Staging-scope" "$UD"

# 46. Positiv kontrol: samme commit, nu også på origin, skal være grøn. Uden den ville 42-45
#     også være grønne hvis gaten bare afviste ALT, og så målte de ingenting.
git -C "$FIX" push -q origin HEAD:refs/heads/main; git -C "$FIX" fetch -q origin
koer --dry-run
assert "46. samme sha, nu på origin, er grøn igen" "0" "$RC"

# 47. Listen kan udvides bevidst, men kun ved at NAVNGIVE remoten, aldrig ved et generelt
#     »en eller anden remote«. Uden dette assert kunne gaten være hårdkodet til origin, og
#     så ville den blokere ethvert repo med en anden navngivning frem for at kunne rettes.
git -C "$FIX" push -q --delete origin main >/dev/null 2>&1 || true
git -C "$FIX" fetch -q --prune --all
UD="$(cd "$FIX" && env -u MYCEL_DEPLOY_HERKOMST_GO MYCEL_HERKOMST_REMOTES='origin|backup-private' \
      bash build-tools/deploy-skemaer.sh --dry-run 2>&1)"; RC=$?
assert "47. en NAVNGIVEN udvidelse af herkomst-remoterne virker" "0" "$RC"


# ── 48-52. DEN KODE DER LÆSER STEMPLET, ER IKKE ET STEMPEL (MYCEL BUILDER 27/7) ───────────────
#   Fundet da de to grene blev landet sammen kl. 17:1x. Hver for sig var begge grønne:
#   `feat/afsender-stempel` lagde LÆSEREN i index.html
#   (`document.querySelector('meta[name="mentem-deploy-sha"]')` + en kommentar der citerer
#   tagget), og `chore/deploy-scoping` lagde TÆLLINGEN her. Sammen aborterede deployet med
#   »har 2 afsender-stempler, forventet præcis 1«, og der var kun ét.
#
#   🔴 Hvorfor prøven ovenfor ikke fangede det: assert 29-38 er skrevet PRÆCIS om denne læser
#   (kommentaren ved 29 citerer endda dens linjenummer), men fixturets index.html indeholder
#   den ikke. Prøven kendte samspillet og målte det ikke. Fixturet er derfor selv påstanden.
#
#   Fejlklassen er ikke »en for løs grep«. Det er en gate der tæller sit eget subjekt ved at
#   søge på tag-NAVNET frem for på tag-FORMEN, altså samme rod som assert_stempel og
#   assert_afsender blev skærpet for: prosa og kode der NÆVNER stemplet, må ikke kunne tælle
#   som stemplet. En fail-closed gate der tæller forkert, blokerer et korrekt deploy, og det er
#   den dyre retning: den lærer huset at overstyre gaten.
git -C "$FIX" push -q origin HEAD:refs/heads/main 2>/dev/null || true
cat > "$FIX/index.html" <<'HTML'
<!DOCTYPE html>
<html lang="da">
<head>
<meta charset="UTF-8">
</head>
<body>x
<script>
//   • <meta name="mentem-deploy-sha"> = den FAKTISK udrullede SHA, indsat af deployet
const _shaMeta = document.querySelector('meta[name="mentem-deploy-sha"]');
</script>
</body>
</html>
HTML
git -C "$FIX" add -A >/dev/null; git -C "$FIX" commit -qm "index med laeser-JS"
git -C "$FIX" push -q origin HEAD:refs/heads/main; git -C "$FIX" fetch -q origin
koer --dry-run
assert "48. et index der LÆSER stemplet, blokerer ikke deployet" "0" "$RC"
assert_har_ikke "49. og aborten om fordoblede stempler udløses ikke" "forventet præcis 1" "$UD"
assert_afsender_antal "50. der tælles præcis ét, læseren ufortalt" \
                      "1" '<meta name="mentem-deploy-sha"' "$UD"
assert_afsender "51. og det ene er deployets egen sha" \
                "<meta name=\"mentem-deploy-sha\" content=\"$(SHA)\">" "$UD"

# 52. 🔴 Negativ kontrol, og uden den måler 48-51 ingenting: to ÆGTE tags skal STADIG afvises.
#     En »fix« der bare slettede tællingen ville gøre 48-51 grønne og genåbne præcis det hul
#     tællingen fandtes for (querySelector ville vilkårligt vælge mellem to SHA'er).
#     Det hånd-holdte tag ligger i <body>, ikke i <head>: fjernelses-awk'en rammer det, men
#     hvis den nogensinde snævres til kun <head>, står der to bagefter, og DET skal ses.
cat > "$FIX/index.html" <<'HTML'
<!DOCTYPE html>
<html lang="da">
<head>
<meta charset="UTF-8">
</head>
<body>x
<meta name="mentem-deploy-sha" content="ffffffffffffffffffffffffffffffffffffffff">
<meta name="mentem-deploy-sha" content="eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee">
</body>
</html>
HTML
git -C "$FIX" add -A >/dev/null; git -C "$FIX" commit -qm "to aegte stempler"
git -C "$FIX" push -q origin HEAD:refs/heads/main; git -C "$FIX" fetch -q origin
koer --dry-run
assert_afsender_antal "52. to ægte tags fordobles ikke, de erstattes af ét" \
                      "1" '<meta name="mentem-deploy-sha"' "$UD"

# 53-57. NÅR DEN NAVNGIVNE HERKOMST-REMOTE SLET IKKE FINDES I REPOET
# 🔴 Født af SECURITY TERMINALs punkt 30/7 om MJ, målt af INFRA i MJ-25c: 41 refs, alle under
# `backup-mirror/`, og `origin` findes ikke. Gaten sagde »findes KUN uden for herkomst-remoten
# (origin)«, hvilket lyder som om origin fandtes og SHA'en manglede på den. **Verdikt rigtigt,
# begrundelse forkert**, og rådet »commit + push« kan så ikke følges. Samme fejlklasse som
# reconcile-gatens suite-ben samme formiddag: et NO af en grund gaten ikke havde målt.
git -C "$FIX" remote rename origin herkomstloes >/dev/null 2>&1
koer --dry-run
assert "53. ukendt herkomst-remote giver stadig rc 3" "3" "$RC"
assert_har "54. og den siger at remoten IKKE FINDES" "FINDES IKKE" "$UD"
assert_har "55. og den navngiver repoets faktiske remotes" "herkomstloes" "$UD"
# 🔴 Den vigtigste af de fem: den GAMLE, misvisende formulering må ikke stå tilbage. Uden
# denne kunne begge beskeder optræde, og læseren ville stadig få den forkerte.
assert_har_ikke "56. og IKKE længere »findes KUN uden for«" "findes KUN uden for" "$UD"

# 57. NEGATIV KONTROL: peges gaten på en remote der FINDES, er den grøn igen.
# Uden den kunne man »fikse« MJ ved at slukke herkomst-kravet for alle, og 53-56 ville
# stadig stå grønne.
UD="$(cd "$FIX" && env -u MYCEL_DEPLOY_HERKOMST_GO MYCEL_HERKOMST_REMOTES=herkomstloes \
      bash build-tools/deploy-skemaer.sh --dry-run 2>&1)"; RC=$?
assert "57. peget på en remote der FINDES, er gaten grøn igen" "0" "$RC"
git -C "$FIX" remote rename herkomstloes origin >/dev/null 2>&1

echo ""
echo "── $ok grønne, $fejl røde ──"
[ "$fejl" -eq 0 ] || exit 1
