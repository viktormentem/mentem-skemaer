// soevn-rettelse-og-natnavn-kontrakt.mjs · Viktors to ordrer 9/8 kl. 18.0x.
// Kør: node test/soevn-rettelse-og-natnavn-kontrakt.mjs
//
// ORDRE 1, ordret: »når man er på "Efter hun har gemt" og man kan trykke på "Ret dagens
// svar", at den nye data der bliver sendt er den jeg ser i SøvnHub men den gamle data er
// stadig gemt. På den måde er det muligt at fange, hvis det er en fejlrettelse eller bare
// data vi kan lære fremadrettet om hvad der mon kunne være typiske fejlindberetninger.«
//
// ORDRE 2, ordret: »det skal være lidt tydeligere hvad "Udfyld for i går" er sammenlignet
// med "Udfyld for i nat" - jeg foreslår, at der står den faktisk dag/nat der er omtales«.
//
// 🔴 PRÆMISSEN HOLDT, OG HULLET VAR STØRRE END ORDREN KUNNE SE. Målt i kilden før en linje
// blev skrevet: `index.html:3244` gjorde `diaryState.entries[idx] = entry`, altså en ren
// overskrivning. Den gamle udgave fandtes ikke bagefter, hverken på disken eller i
// forsendelsen. Men den DYRE del lå et andet sted: `buildPayloadCSD` bygger hver nat af en
// HVIDLISTE (`for (const k of FIELD_KEYS)`), så et `tidligere`-felt ville være blevet gemt
// trofast på klientens telefon og TAVST droppet mellem hendes disk og psykologens skærm.
// Havde jeg kun bygget det ordren beskrev, ville prøven have været grøn og Viktor have
// fået nul rettelser at se. Derfor er den bærende prøve her en payload-prøve, ikke en
// state-prøve.
//
// Prøverne læser de ÆGTE funktioner ud af index.html og kører dem i en tom vm-kontekst,
// samme teknik som soevn-baseline-nudging-kontrakt.mjs.

import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { buildPayloadCSD } from '../mentem-skema-core.js';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

let fejl = 0, ok = 0;
function check(navn, betingelse, detalje) {
  if (betingelse) { ok++; console.log(`  ✓ ${navn}`); }
  else { fejl++; console.error(`  ✗ ${navn}${detalje ? ` :: ${detalje}` : ''}`); }
}

// ── Udtræk kilden ────────────────────────────────────────────────────────────
const maxMatch = html.match(/const RETTELSER_MAX\s*=\s*(\d+)\s*;/);
const mdrMatch = html.match(/const BASELINE_MAANEDER\s*=\s*\[[\s\S]*?\];/);
const ugeMatch = html.match(/const NAT_UGEDAGE\s*=\s*\[[\s\S]*?\];/);
const histMatch = html.match(/function nyHistorik\([\s\S]*?\n\}/);
const natMatch = html.match(/function natNavn\([\s\S]*?\n\}/);
check('RETTELSER_MAX findes i index.html', !!maxMatch);
check('BASELINE_MAANEDER findes i index.html', !!mdrMatch);
check('NAT_UGEDAGE findes i index.html', !!ugeMatch);
check('nyHistorik() findes i index.html', !!histMatch);
check('natNavn() findes i index.html', !!natMatch);
if (!maxMatch || !mdrMatch || !ugeMatch || !histMatch || !natMatch) {
  console.error('\nINSTRUMENTET ER DOEDT: kilde-udtraek fejlede, ingen dom.');
  process.exit(3);
}
const RETTELSER_MAX = Number(maxMatch[1]);

const kildeHist = `${maxMatch[0]}\n${histMatch[0]}`;
const kildeNat = `${mdrMatch[0]}\n${ugeMatch[0]}\n${natMatch[0]}`;
const hist = (forrige, max) => runInNewContext(
  `${kildeHist}\nnyHistorik(f, m);`, { f: forrige, m: max }, { timeout: 1000 });
const nat = (iso, medDato) => runInNewContext(
  `${kildeNat}\nnatNavn(d, md);`, { d: iso, md: medDato }, { timeout: 1000 });

// ═════════════════════════════════════════════════════════════════════════════
console.log('\nORDRE 1 · rettelsen erstatter, den gamle udgave bliver');
// ═════════════════════════════════════════════════════════════════════════════

// POS-KTRL først: kan nålen overhovedet se en FORSKEL? Uden det måler resten intet.
const gammel = { date: '2026-08-09', savedAt: '2026-08-09T07:10:00Z', bedtime: '23:30', quality: 3 };
const h1 = hist(gammel, RETTELSER_MAX);
check('POS-KTRL: den udgåede udgave bæres med, med sine egne værdier',
  h1.tidligere.length === 1 && h1.tidligere[0].bedtime === '23:30' && h1.tidligere[0].quality === 3,
  JSON.stringify(h1));
check('den udgåede udgave beholder sit eget savedAt (hvornår den blev gemt)',
  h1.tidligere[0].savedAt === '2026-08-09T07:10:00Z');
check('intet er kappet ved første rettelse', h1.tidligereKappet === 0);

// NEG-KTRL: historikken må ALDRIG indlejre sig selv. Uden dette vokser én nat
// eksponentielt, og den tiende rettelse ville bære ni kopier af den niende.
const medHistorik = { ...gammel, tidligere: [{ date: '2026-08-09', quality: 1 }] };
const h2 = hist(medHistorik, RETTELSER_MAX);
check('NEG-KTRL: ingen rekursiv indlejring (den nyeste udgåede bærer ikke historikken)',
  h2.tidligere.length === 2 && h2.tidligere.every(t => t.tidligere === undefined),
  JSON.stringify(h2));
check('ældst først: rækkefølgen er kronologisk',
  h2.tidligere[0].quality === 1 && h2.tidligere[1].quality === 3);

// Loftet må ikke være tavst.
const mange = { ...gammel, tidligere: Array.from({ length: RETTELSER_MAX }, (_, i) => ({ date: '2026-08-09', quality: i })) };
const h3 = hist(mange, RETTELSER_MAX);
check(`loftet holder listen på ${RETTELSER_MAX}`, h3.tidligere.length === RETTELSER_MAX);
check('loftet er IKKE tavst: det kappede tælles', h3.tidligereKappet === 1, JSON.stringify(h3.tidligereKappet));
const h4 = hist({ ...mange, tidligereKappet: 5 }, RETTELSER_MAX);
check('kappet akkumulerer over flere rettelser', h4.tidligereKappet === 6);

// ═════════════════════════════════════════════════════════════════════════════
console.log('\nORDRE 1 · den BÆRENDE prøve: overlever historikken hvidlisten?');
// ═════════════════════════════════════════════════════════════════════════════

const rettet = {
  date: '2026-08-09', savedAt: '2026-08-09T09:00:00Z',
  bedtime: '22:45', quality: 4,
  tidligere: [{ date: '2026-08-09', savedAt: '2026-08-09T07:10:00Z', bedtime: '23:30', quality: 3 }],
};
const p = buildPayloadCSD([rettet], { plannedDays: 14 }).data;
const nat0 = p.sleepDiary[0];

// Viktors første krav: det HUBBEN ser skal være det nye.
check('den gældende udgave i payloaden er den NYE', nat0.bedtime === '22:45' && nat0.quality === 4,
  JSON.stringify(nat0));
// Viktors andet krav: den gamle er stadig der.
check('den gamle udgave overlever hele vejen ud i payloaden',
  Array.isArray(nat0.tidligere) && nat0.tidligere.length === 1 && nat0.tidligere[0].bedtime === '23:30',
  JSON.stringify(nat0.tidligere));
check('rettelsens tidspunkt kan aflæses (gældende savedAt er med)',
  nat0.savedAt === '2026-08-09T09:00:00Z');
check('den gamle udgaves tidspunkt er med, så rækkefølgen kan afgøres',
  nat0.tidligere[0].savedAt === '2026-08-09T07:10:00Z');

// NEG-KTRL: en nat der ALDRIG er rettet må ikke bære et tomt `tidligere`. Ellers kan
// »ikke rettet« ikke skelnes fra »rettet til det samme« i psykologens materiale.
const uRettet = buildPayloadCSD([{ date: '2026-08-08', bedtime: '23:00', savedAt: '2026-08-08T07:00:00Z' }], {}).data;
check('NEG-KTRL: en urettet nat har INTET tidligere-felt',
  uRettet.sleepDiary[0].tidligere === undefined, JSON.stringify(uRettet.sleepDiary[0]));
check('NEG-KTRL: en urettet nat har intet tidligereKappet',
  uRettet.sleepDiary[0].tidligereKappet === undefined);

// Hvidlisten skal gælde historikken OGSÅ. En rettelse må ikke være en bagvej for felter
// der ellers ikke eksporteres.
const medSnavs = buildPayloadCSD([{
  date: '2026-08-09', bedtime: '22:45',
  tidligere: [{ date: '2026-08-09', bedtime: '23:30', hemmeligtInternt: 'må aldrig ud', notat: 'heller ikke' }],
}], {}).data;
check('hvidlisten gælder også de tidligere udgaver (ukendte felter slipper ikke ud)',
  medSnavs.sleepDiary[0].tidligere[0].hemmeligtInternt === undefined
  && medSnavs.sleepDiary[0].tidligere[0].bedtime === '23:30',
  JSON.stringify(medSnavs.sleepDiary[0].tidligere[0]));

// Loftets tæller skal også ud, ellers er det tavst netop hvor det betyder mest.
const medKappet = buildPayloadCSD([{ date: '2026-08-09', bedtime: '22:45', tidligereKappet: 3,
  tidligere: [{ date: '2026-08-09', bedtime: '23:30' }] }], {}).data;
check('tidligereKappet når ud i payloaden', medKappet.sleepDiary[0].tidligereKappet === 3);

// ═════════════════════════════════════════════════════════════════════════════
console.log('\nORDRE 2 · knapperne siger hvilken nat de handler om');
// ═════════════════════════════════════════════════════════════════════════════

// 2026-08-09 er en søndag, 2026-08-08 en lørdag. POS-KTRL på selve kalenderen først:
// en ugedags-tabel der er forskudt med én ville give pæne, forkerte etiketter hele vejen.
check('POS-KTRL: kalenderen er rigtig (9. august 2026 er en søndag)',
  new Date('2026-08-09T12:00:00').getDay() === 0);

check('i nat hedder sin ugedag', nat('2026-08-09', false) === 'natten til søndag', nat('2026-08-09', false));
check('i går hedder SIN ugedag, altså en anden', nat('2026-08-08', false) === 'natten til lørdag', nat('2026-08-08', false));
check('de to knapper kan ikke forveksles', nat('2026-08-09', false) !== nat('2026-08-08', false));
check('den lange form bærer datoen', nat('2026-08-09', true) === 'natten til søndag 9. august', nat('2026-08-09', true));
check('måneden er dansk og uden forkortelse', nat('2026-12-01', true) === 'natten til tirsdag 1. december', nat('2026-12-01', true));

// Knapperne er korte nok til én linje på en telefon. Målt som tegn, ikke gættet.
const knapIDag = `Udfyld ${nat('2026-08-09', false)}`;
const knapIGaar = `Udfyld ${nat('2026-08-08', false)} (den manglede)`;
console.log(`  MAALT knap-laengder: "${knapIDag}" = ${knapIDag.length} tegn · "${knapIGaar}" = ${knapIGaar.length} tegn`);
check('primær-knappen holder sig under 30 tegn', knapIDag.length < 30, `${knapIDag.length}`);

// NEG-KTRL: en dato der ikke kan læses må give NULL, så kaldestedet falder tilbage til
// den gamle tekst. En etiket der gætter en ugedag er værre end en der ikke findes.
check('NEG-KTRL: ulæselig dato giver null (der gættes aldrig en ugedag)',
  nat('ikke-en-dato', false) === null, String(nat('ikke-en-dato', false)));

// Alle syv ugedage skal kunne rammes, ellers er tabellen kun bevist på to felter.
const uge = ['2026-08-09', '2026-08-10', '2026-08-11', '2026-08-12', '2026-08-13', '2026-08-14', '2026-08-15']
  .map(d => nat(d, false));
check('alle syv ugedage er forskellige og ingen er tom',
  new Set(uge).size === 7 && uge.every(u => u && u.startsWith('natten til ')), uge.join(' | '));

// ── Em dash: Viktors regel, målt på det jeg har skrevet ──────────────────────
const emDash = html.split('\n').filter(l => l.includes('—') && /natNavn|nyHistorik|RETTELSER_MAX|NAT_UGEDAGE/.test(l));
check('ingen em dash i de linjer denne ordre tilføjede', emDash.length === 0, emDash.join(' | '));

console.log(`\n${ok} ok · ${fejl} fejl`);
process.exit(fejl ? 1 : 0);
