// soevn-periode-header-kontrakt.mjs: TTL-kontrakten mellem dagbogssiden og draftstore-workeren.
// Kør: node test/soevn-periode-header-kontrakt.mjs
//
// Serveren fik 13-08-2026 sin TTL bundet til forløbets egen periode (`X-Soevn-Periode-Dage`,
// worker.js:65-125) i stedet for til en global 45-dages konstant. Men KLIENTEN sendte ikke
// headeren, så alle forløb fortsatte på fallbackets 45 dage: et 90-dages forløb fik sin
// server-kladde slettet MENS klienten stadig førte dagbog. §7 så lukket ud i dokumentet og
// var åben i praksis. Denne prøve findes for at den halve indløsning ikke kan gentage sig.
//
// Prøven læser den ÆGTE kilde ud af index.html og worker.js og kører den, frem for at
// gentage tal og strenge som konstanter her: en kopi ville være grøn præcis når den var
// forkert. Samme teknik som soevn-dagbog-periode-kontrakt.mjs.
//
// 🔴 Instrument-reglen: kan en af de to kilder ikke læses, afgives der INGEN dom (exit 3).
// »Målte og fandt intet forkert« og »målte ikke« må ikke kunne forveksles.

import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const HTML_URL = new URL('../index.html', import.meta.url);
// Workeren bor i ops-repoet ved siden af dette; den er den ANDEN halvdel af kontrakten,
// og en kontrakt der kun læser sin egen side af snittet måler ingenting.
const WORKER_URL = new URL('../../Projekt_Praksis/workers/soevn-draftstore/worker.js', import.meta.url);

function laes(url, hvad) {
  try { return readFileSync(url, 'utf8'); }
  catch (e) {
    console.error(`INSTRUMENTET ER DOEDT: kunne ikke læse ${hvad} (${url.pathname}), ingen dom.`);
    process.exit(3);
  }
}

const html = laes(HTML_URL, 'index.html');
const worker = laes(WORKER_URL, 'draftstore-workeren');

let fejl = 0;
function check(navn, ok, detalje) {
  if (ok) { console.log(`  ✓ ${navn}`); }
  else { fejl++; console.error(`  ✗ ${navn}${detalje ? ` :: ${detalje}` : ''}`); }
}
// Skellet mellem »ingen dom« og »rød«: instrumentet er dødt når en FIL eller en hel
// FUNKTION ikke kan findes, for så har prøven intet at måle på. Men et tal der mangler
// INDE i en funktion vi har fundet, er ikke et brudt instrument: det er kontrakten der
// er brudt, og det skal give en rød dom som enhver anden. Blandes de to, kan en ægte
// rødhed blive nedgraderet til »kunne ikke måles« af en linje længere nede.
function udtraek(kilde, re, hvad) {
  const m = kilde.match(re);
  if (!m) {
    console.error(`INSTRUMENTET ER DOEDT: ${hvad} kunne ikke udtrækkes, ingen dom.`);
    process.exit(3);
  }
  return m;
}
function udtraekTal(kilde, re, hvad) {
  const m = kilde.match(re);
  if (!m) { fejl++; console.error(`  ✗ ${hvad} findes ikke i kilden`); return NaN; }
  return Number(m[1]);
}

// ── 1. Headerens NAVN skal være det samme i begge ender ───────────────────────
// Et stavefejlet navn giver ingen fejl nogen steder: serveren ser blot en manglende
// header og falder tavst tilbage til de 45 dage. Præcis den tavse retning igen.
const klientNavn = udtraek(html, /const PERIODE_HEADER_NAVN\s*=\s*'([^']+)'/, 'klientens headernavn')[1];
const serverNavn = udtraek(worker, /const PERIODE_HEADER\s*=\s*'([^']+)'/, 'serverens headernavn')[1];
check(`headernavnet er identisk i begge ender (${klientNavn})`, klientNavn === serverNavn,
  `klient=${klientNavn} server=${serverNavn}`);

// Serveren skal også tillade den i CORS, ellers afviser browseren preflight'en.
check('headeren står i serverens Access-Control-Allow-Headers',
  /const ALLOW_HEADERS\s*=[^;]*PERIODE_HEADER/.test(worker));

// ── 2. Værdi-afbildningen ─────────────────────────────────────────────────────
const fnMatch = udtraek(html, /function periodeHeaderVaerdi\(dage\)\s*\{[\s\S]*?\n\}/, 'periodeHeaderVaerdi()');
function headerFor(dage) {
  return runInNewContext(`${fnMatch[0]}\nperiodeHeaderVaerdi(dage);`, { dage }, { timeout: 1000 });
}

// ── 3. Klientens PUT skal faktisk vedhæfte den ────────────────────────────────
// Det bærende krav: funktionen kan være nok så korrekt, hvis kaldet ikke bruger den.
//
// 🔴 Målt på denne prøve selv: her stod først en tekst-søgning efter
// `headers[PERIODE_HEADER_NAVN] =`, og en mutant der satte linjen til `if (false)` gik
// LIGE IGENNEM (1 overlevende af 8). En kilde-søgning kan se at en linje er SKREVET,
// aldrig at den bliver KØRT. Derfor køres header-blokken nu, og dommen falder på det
// objekt den faktisk producerer.
const pushMatch = udtraek(html, /async function pushDraft\(\)\s*\{[\s\S]*?\n\}/, 'pushDraft()');
const headerBlok = udtraek(pushMatch[0],
  /(const headers\s*=\s*\{[\s\S]*?)\n\s*const res\s*=\s*await fetch\(/, 'header-blokken i pushDraft()')[1];
check('PUT-kaldet sender headers-objektet videre', /method:\s*'PUT',\s*headers\b/.test(pushMatch[0]),
  'PUT-kaldet bygger et headers-objekt det aldrig sender');

/// Kør blokken med et LÅST forløb på 90 dage og et ?d= der siger noget ANDET (14).
/// De to tal skal være forskellige: er de ens, kan prøven ikke se om koden læste den
/// låste tilstand eller den friske URL-parameter, og præcis dét er fejlen der betyder
/// noget (perioden låses ved første åbning, `?d=` kan være nyere).
function byggedeHeaders(plannedDays) {
  return runInNewContext(
    `${fnMatch[0]}\nconst PERIODE_HEADER_NAVN = ${JSON.stringify(klientNavn)};\n${headerBlok}\nheaders;`,
    { diaryState: { plannedDays }, dParam: 14 }, { timeout: 1000 });
}
const h90 = byggedeHeaders(90);
check('et 90-dages forløb sender headeren med "90"', h90[klientNavn] === '90',
  `fik ${JSON.stringify(h90)}, serveren ville falde tilbage til 45 dage`);
check('Content-Type er uændret på plads', h90['Content-Type'] === 'application/json',
  `fik ${JSON.stringify(h90['Content-Type'])}`);
const hUgyldig = byggedeHeaders(0);
check('en ugyldig periode sender INGEN header (serveren beholder dagens adfærd)',
  !(klientNavn in hUgyldig), `fik ${JSON.stringify(hUgyldig)}`);

console.log('Hele appens tilladte interval skal sendes uændret, som streng:');
for (const d of [1, 7, 14, 21, 30, 60, 89, 90]) {
  check(`${d} → "${d}"`, headerFor(d) === String(d), `fik ${JSON.stringify(headerFor(d))}`);
}

console.log('Uden for appens interval: send INTET, aldrig et klampet tal:');
// Serveren falder selv tilbage til dagens 45 dage når headeren mangler, så en udeladelse
// er nøjagtig status quo. Et klampet tal ville derimod forære en fremmed værdi en
// tilsyneladende gyldig retention, samme beslutning som `?d=` traf 25-07.
// 🔵 `JSON.stringify` skriver BÅDE NaN og null som "null", så etiketterne ville være to ens
// linjer for to forskellige inputs. En prøve hvis udskrift ikke kan skelne sine egne tilfælde
// fra hinanden, kan heller ikke fortælle hvilket af dem der faldt.
const vis = (v) => (typeof v === 'number' && Number.isNaN(v)) ? 'NaN' : String(v);
for (const d of [0, -1, 91, 365, 100000, 14.5, NaN, null, undefined, '14']) {
  check(`${vis(d)} → ingen header`, headerFor(d) === null, `fik ${JSON.stringify(headerFor(d))}`);
}

// ── 4. De to øvre grænser må ikke kunne glide fra hinanden ────────────────────
// En periode der er gyldig at føre dagbog i, skal være gyldig at opbevare. Glider de,
// får klienten en dagbog hvis kladde serveren nægter at give den rigtige levetid.
const klientMaks = udtraekTal(fnMatch[0], /dage\s*>\s*(\d+)/, 'klientens øvre grænse');
const dagbogMaks = udtraekTal(html, /function diaryPlannedDays\(\)[\s\S]*?dParam\s*<=\s*(\d+)/, 'diaryPlannedDays-grænsen');
const serverMaks = udtraekTal(worker, /const PERIODE_MAKS\s*=\s*(\d+)/, 'serverens PERIODE_MAKS');
check(`header-grænsen (${klientMaks}) = dagbogs-grænsen (${dagbogMaks})`, klientMaks === dagbogMaks);
check(`header-grænsen (${klientMaks}) = serverens PERIODE_MAKS (${serverMaks})`, klientMaks === serverMaks);

// ── 5. Marginen er husets, og den skal blive ved med at være det ──────────────
// GRACE_DAGE = SoevnLinkUdloeb.graceDage = 7. Blob'en skal overleve præcis så længe
// linket kan nå den; en margin der skrumper er tavst datatab i den anden ende.
const grace = udtraekTal(worker, /const GRACE_DAGE\s*=\s*(\d+)/, 'serverens GRACE_DAGE');
check(`serverens margin er husets 7 dage (fik ${grace})`, grace === 7,
  'SoevnLinkUdloeb.swift:14 graceDage = 7, udløb/max = plannedDays + 7, TCC-ack\'et 12/6');

console.log(fejl === 0 ? '\nALLE GRØNNE' : `\n${fejl} RØDE`);
process.exit(fejl === 0 ? 0 : 1);
