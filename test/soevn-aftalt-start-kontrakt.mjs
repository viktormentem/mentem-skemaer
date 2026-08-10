// soevn-aftalt-start-kontrakt.mjs — `?start=`-kontrakten mellem Mentem-appen og dagbogssiden.
// Kør: node test/soevn-aftalt-start-kontrakt.mjs
//
// Viktor-GO 10/8 (spm. 4, svar 1): når behandlingen bevidst udskydes (ferie, indlæggelse),
// skal klienten kunne se den samme opstartsdato som står i Viktors hub. Kontrakten er
// `&start=YYYY-MM-DD`, lokal dato, valgfri.
//
// 🔴 ORDREN PEGEDE PÅ DET FORKERTE REPO. Den sagde `mentem-skemaer-lokal`. Målt på artefaktet
// (ikke på pointeren): den fils første script i `<head>` er en ubetinget
// `window.location.replace` til skemaer.mycel.dk (`aa1d9bb`, 22/6, 0 upushede), og dens egen
// kommentar siger »resten af siden indlæses aldrig«. En linje bygget dér ville aldrig køre.
// Redirecten bærer `location.search` 1:1 videre, så KONTRAKTEN overlever hoppet — kun
// byggestedet var forkert. Denne fil er den kanoniske flade (CNAME skemaer.mycel.dk).
//
// 🔴 OG DEN DYRESTE HALVDEL BAD ORDREN IKKE OM. Fladen HAVDE allerede en startdato:
// `diaryState.startedAt` = den dag klienten første gang åbnede linket. Den gater uge-1-
// kadencen gennem `diaryDayIndex()` → `diaryFieldVisible()`. Byggede vi kun den synlige
// linje, ville siden have to startdatoer der er uenige, og SAFETY-feltet
// (`daytimeSleepiness_0_10`) ville være skjult HELE første behandlingsuge, tavst.
//
// Prøven læser de ÆGTE linjer ud af index.html. En kopi af logikken her ville være grøn
// præcis når kilden holdt op med at matche den.

import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

let fejl = 0;
function check(navn, ok, detalje) {
  if (ok) { console.log(`  ✓ ${navn}`); }
  else { fejl++; console.error(`  ✗ ${navn}${detalje ? ` :: ${detalje}` : ''}`); }
}

// ── 1. Validatoren: udtræk den ægte funktion og kør den ───────────────────────
const fnMatch = html.match(/function gyldigISODato\(s\)\s*\{[\s\S]*?\n\}/);
check('gyldigISODato() findes i index.html', !!fnMatch);
if (!fnMatch) { console.error('\nKilde-udtræk fejlede — kontrakten kan ikke måles.'); process.exit(1); }

const sandkasse = {};
runInNewContext(fnMatch[0] + '\n;globalThis.__f = gyldigISODato;', sandkasse);
const gyldig = sandkasse.__f;

// 🔴 Regex ALENE ville bestå de to første: `2026-13-45` og `2026-02-30` matcher
// `\d{4}-\d{2}-\d{2}`. Det er hele grunden til rundturen gennem Date.
for (const [vaerdi, ventet, hvorfor] of [
  ['2026-13-45', false, 'måned 13 / dag 45 matcher regex, men findes ikke'],
  ['2026-02-30', false, '30. februar matcher regex, men findes ikke'],
  ['2026-02-29', false, '2026 er ikke skudår'],
  ['2026-6-4',   false, 'uden nul-padding er det ikke husets ISO-form'],
  ['',           false, 'tom værdi'],
  ['tekst',      false, 'ikke en dato'],
  [null,         false, 'fraværende parameter må ikke kaste'],
  ['2026-06-24', true,  'den ægte aftale-dato'],
  // 🔴 NEG-KTRL: en validator der bare afviste alt, ville bestå alle linjer ovenfor.
  // Denne er den eneste der kan skelne »streng« fra »død«.
  ['2028-02-29', true,  'NEG-KTRL: 2028 ER skudår, så en ægte skuddag skal ACCEPTERES'],
]) {
  check(`gyldigISODato(${JSON.stringify(vaerdi)}) === ${ventet}  (${hvorfor})`,
        gyldig(vaerdi) === ventet, `fik ${gyldig(vaerdi)}`);
}

// ── 2. Parameteren er fail-closed ────────────────────────────────────────────
// 🔴 Fladens vane er fail-OPEN: `?d=` bruger parseInt (`parseInt("13abc")` = 13) og `?dato=`
// bruger `|| ''`. Formen her fandtes ikke og skulle bygges, så prøven pinner at den bruger
// validatoren og ikke bare læser parameteren rå.
const konstMatch = html.match(/const AFTALT_START\s*=\s*(.+);/);
check('AFTALT_START defineres i index.html', !!konstMatch);
check('AFTALT_START går gennem gyldigISODato (fail-closed)',
      !!konstMatch && konstMatch[1].includes('gyldigISODato'),
      konstMatch ? konstMatch[1] : 'ikke fundet');

// ── 3. Den usynlige startdato sås fra den aftalte ────────────────────────────
// Den halvdel ordren ikke bad om. Uden den har siden to startdatoer der kan divergere.
const seedMatch = html.match(/diaryState\s*=\s*loadCSD\(\)\s*\|\|\s*\{[^}]*\}/);
check('diaryState-seedningen findes i index.html', !!seedMatch);
check('startedAt sås fra AFTALT_START, ikke kun fra todayISO()',
      !!seedMatch && /startedAt:\s*\(AFTALT_START\s*\|\|\s*todayISO\(\)\)/.test(seedMatch[0]),
      seedMatch ? seedMatch[0].slice(0, 120) : 'ikke fundet');
// 🔵 `loadCSD() ||`-vagten SKAL blive stående: uden den ville en igangværende klients egen
// startdato blive overskrevet ved hver åbning, og perioden ville aldrig kunne skride frem.
check('igangværende klienter beholder deres egen dato (loadCSD()-vagten står først)',
      !!seedMatch && seedMatch[0].startsWith('diaryState = loadCSD() ||'));

// ── 4. Visningens tre tilstande sammenlignes som STRENGE, ikke som Date ──────
// ISO sorterer kronologisk, så streng-sammenligning er både korrekt og immun over for
// tidszoner. Fladen gør det allerede selv (`y >= diaryState.startedAt`).
const renderMatch = html.match(/const asEl = document\.getElementById\('aftalt-start'\);[\s\S]*?\n  \}/);
check('render-blokken for aftalt-start findes', !!renderMatch);
if (renderMatch) {
  const blok = renderMatch[0];
  check('sammenligner AFTALT_START mod todayISO() som strenge',
        /AFTALT_START\s*>=\s*iDag/.test(blok), 'fandt ingen streng-sammenligning');
  check('har en EGEN tekst for »i dag«', /=== iDag/.test(blok));
  // 🔴 TILFØJET EFTER EN RENDER, IKKE EFTER EN TANKE. Første udgave af prøven krævede kun
  // linjen ovenfor, og den var grøn mens siden på selve startdagen sagde »Du behøver ikke
  // gøre noget før da« — altså det modsatte af hvad klienten skulle. Overskriften havde sin
  // egen gren; detalje-linjen havde ikke. En sætning der er rigtig i to af tre tilstande,
  // er forkert i den tredje.
  check('detalje-linjen forgrener OGSÅ på »i dag« (ikke kun overskriften)',
        /const detalje\s*=\s*iGang/.test(blok), 'detalje-linjen er den samme i alle tilstande');
  check('teksten på startdagen beder om den første nat, i stedet for at sige vent',
        /Udfyld din første nat/.test(blok));
  check('skjuler linjen når starten er passeret (ingen tom kasse)',
        /style\.display\s*=\s*'none'/.test(blok));
  // 🔴 Den eneste Date der må findes i blokken, er den der skriver månedens navn — og den
  // SKAL bære `T12:00:00`. En bar `new Date('YYYY-MM-DD')` parses som UTC-midnat og viser
  // dagen før vest for UTC. Målt: 0 bare ISO-parses i hele filen; det skal blive ved.
  const bareParses = blok.match(/new Date\((?!.*T\d{2}:)[^)]*\)/g) || [];
  check('ingen bar ISO-parse i blokken (tidszone-fælden)', bareParses.length === 0,
        bareParses.join(' · '));
}

// ── 5. »Udfyld for i nat« forbliver ÅBEN før den aftalte start ───────────────
// 🔴 VIKTOR-GO 10/8 (spm. 5, svar 1). Dette er en prøve på en BESLUTNING, ikke på en fejl:
// adfærden er den samme som før, og netop derfor kunne den lukkes i tavshed af en fremtidig
// »oprydning« der syntes det var inkonsistent at backfill er gatet og denne ikke er.
// Begrundelsen, så den næste ikke skal gætte: en klient der selv skriver i ferien, leverer
// data psykologen kan bruge, og nætterne falder før `startedAt` og tæller derfor ikke i
// uge-1-kadencen. De kan kun tilføje. En spærret knap ville læses som »du må ikke«.
const startBtnMatch = html.match(/getElementById\('diary-start-btn'\)\.addEventListener\([^\n]*\n?/);
check('»Udfyld for i nat«-knappen findes', !!startBtnMatch);
check('knappen er IKKE gatet af AFTALT_START (Viktor-GO spm. 5 svar 1)',
      !!startBtnMatch && !startBtnMatch[0].includes('AFTALT_START'),
      startBtnMatch ? startBtnMatch[0].trim() : 'ikke fundet');

// ── 6. Kontrakten er den samme i BEGGE ender ─────────────────────────────────
// 🔵 Mentem-siden bygger `&start=` i `buildSoevndagbogUrl` (SMSTemplates.swift). Den har sin
// egen prøve derovre; her pinnes kun at navnet ikke er drevet. Et parameternavn er den ene
// ting to repoer ikke kan opdage er blevet uenige om.
check('parameteren hedder præcis `start`', html.includes("params.get('start')"));

console.log(fejl === 0 ? '\nOK — ?start=-kontrakten holder.' : `\n${fejl} fejl.`);
process.exit(fejl === 0 ? 0 : 1);
