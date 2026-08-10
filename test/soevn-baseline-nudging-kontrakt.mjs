// soevn-baseline-nudging-kontrakt.mjs · baseline-nudgingen i klientens søvndagbog.
// Kør: node test/soevn-baseline-nudging-kontrakt.mjs
//
// HVORFOR DEN FINDES. Viktor 9/8: fremdriften i dagbogen skal vaere positiv nudging, ikke kun
// en optaelling. Ordren antog at fladen allerede viste »X af 14 dage«. Det gjorde den ikke.
// MAALT foer en linje blev skrevet (playwright, index.html serveret fra 127.0.0.1,
// ?s=soevndagbog&d=90, 11 gemte naetter): fladen viste **»Dag 12 af 90«** og **90 prikker**,
// 11 fyldte. Ordet »baseline« stod 0 steder. Perioden er appens standard (d=90), saa en klient
// tre naetter fra maalet saa ud til at vaere 12 % igennem.
//
// DERFOR ER DEN BAERENDE PROEVE EN NEG-KTRL: nudgingen maa ALDRIG regne i perioden.
// Regnede den i plannedDays, ville den vaere gron paa 14-linket og forkert paa det link
// klienterne faktisk faar.
//
// Proeven laeser den AEGTE funktion ud af index.html og koerer den i en tom vm-kontekst,
// samme teknik som soevn-dagbog-periode-kontrakt.mjs: en genskrevet kopi ville vaere gron
// praecis i det oejeblik kilden holdt op med at matche den.

import { readFileSync, existsSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

let fejl = 0, umaalt = 0, ok = 0;
function check(navn, betingelse, detalje) {
  if (betingelse) { ok++; console.log(`  ✓ ${navn}`); }
  else { fejl++; console.error(`  ✗ ${navn}${detalje ? ` :: ${detalje}` : ''}`); }
}

// ── Udtraek kilden ───────────────────────────────────────────────────────────
const maalMatch = html.match(/const BASELINE_MAAL_NAETTER\s*=\s*(\d+)\s*;/);
const mdrMatch = html.match(/const BASELINE_MAANEDER\s*=\s*\[[\s\S]*?\];/);
const fnMatch = html.match(/function baselineNudging\([\s\S]*?\n\}/);
check('BASELINE_MAAL_NAETTER findes i index.html', !!maalMatch);
check('BASELINE_MAANEDER findes i index.html', !!mdrMatch);
check('baselineNudging() findes i index.html', !!fnMatch);
if (!maalMatch || !mdrMatch || !fnMatch) {
  console.error('\nINSTRUMENTET ER DOEDT: kilde-udtraek fejlede, ingen dom.');
  process.exit(3);
}
const BASELINE_MAAL_NAETTER = Number(maalMatch[1]);

// `dateISO` injiceres som attrap med et FAST »i dag« (2026-08-09), saa dato-teksten er
// deterministisk. Attrappen har samme kontrakt som sidens egen: offset i dage -> ISO.
const I_DAG = '2026-08-09';
function nud(gemte, harIDag, srtAktiv = false) {
  const kode = `${mdrMatch[0]}\n${fnMatch[0]}\nbaselineNudging(g, h, s);`;
  return runInNewContext(kode, {
    g: gemte, h: harIDag, s: srtAktiv,
    BASELINE_MAAL_NAETTER,
    dateISO: (offset) => {
      const d = new Date(I_DAG + 'T12:00:00Z');
      d.setUTCDate(d.getUTCDate() + offset);
      return d.toISOString().slice(0, 10);
    },
  }, { timeout: 1000 });
}
const altText = (r) => r ? [r.stort, r.detalje, r.naerhed || ''].join(' ') : '';

// ── POS-KTRL: kan naalen overhovedet sige noget ANDET end det forventede? ─────
// Uden denne kan alle proever nedenfor vaere gronne paa en funktion der returnerer
// en konstant. Vi kraever at to nabo-tilstande giver to forskellige store linjer.
console.log('POS-KTRL (kan maaleren skelne?):');
check('11 og 12 naetter giver FORSKELLIG stor linje',
  nud(11, false).stort !== nud(12, false).stort,
  `begge: ${JSON.stringify(nud(11, false).stort)}`);
check('samme input giver samme svar (funktionen er ren)',
  JSON.stringify(nud(11, false)) === JSON.stringify(nud(11, false)));

// ── NEG-KTRL: perioden maa ikke kunne farve nudgingen ────────────────────────
console.log('NEG-KTRL (perioden er IKKE maalet):');
check('funktionen roerer overhovedet ikke plannedDays',
  !/plannedDays/.test(fnMatch[0]), 'kilden naevner plannedDays');
check('funktionen tager tre argumenter, og ingen af dem er en periode',
  /function baselineNudging\(gemteNaetter, harUdfyldtIDag, srtErAktiv\)/.test(fnMatch[0]),
  fnMatch[0].split('\n')[0]);
for (const g of [0, 1, 7, 13, 14, 20]) {
  const t = altText(nud(g, false));
  check(`»90« optraeder ikke i teksten ved ${g} gemte naetter`, !/90/.test(t), t);
}

// ── Boejning: 1 nat vs. N naetter ────────────────────────────────────────────
console.log('Boejning:');
check('13 gemte -> »1 nat tilbage«', /\b1 nat tilbage\b/.test(nud(13, false).stort), nud(13, false).stort);
check('13 gemte -> IKKE »naetter«', !/1 nætter/.test(nud(13, false).stort), nud(13, false).stort);
check('12 gemte -> »2 nætter tilbage«', /\b2 nætter tilbage\b/.test(nud(12, false).stort), nud(12, false).stort);
check('11 gemte -> »3 nætter tilbage af de første 14«',
  nud(11, false).stort === `3 nætter tilbage af de første ${BASELINE_MAAL_NAETTER}`, nud(11, false).stort);
check('0 gemte -> egen aabnings-linje, ikke »14 nætter tilbage af de første 14«',
  nud(0, false).stort === `${BASELINE_MAAL_NAETTER} nætter til en god start`, nud(0, false).stort);

// ── Naerheden: hvornaar er hun igennem? ──────────────────────────────────────
// Med 13 gemte og dagens nat ikke udfyldt kan den sidste klares I DAG. Er dagens nat
// udfyldt, er der en nat tilbage og den ligger i morgen. En off-by-one her ville lyde
// som et loefte klienten ikke kan indfri.
console.log('Naerhed (dato-ankeret er I DAG, ikke sidste udfyldte nat):');
check('13 gemte, dagens nat mangler -> »allerede i dag«',
  /allerede i dag/.test(nud(13, false).naerhed), nud(13, false).naerhed);
check('13 gemte, dagens nat udfyldt -> »i morgen«',
  /i morgen/.test(nud(13, true).naerhed), nud(13, true).naerhed);
check('11 gemte, dagens nat mangler -> »omkring 11. august« (i dag 9/8 + 2)',
  /omkring 11\. august/.test(nud(11, false).naerhed), nud(11, false).naerhed);
check('0 gemte -> »omkring 22. august« (i dag 9/8 + 13)',
  /omkring 22\. august/.test(nud(0, false).naerhed), nud(0, false).naerhed);

// ── Fuld baseline: budskabet SKIFTER, det forsvinder ikke tavst ──────────────
console.log('Fuld baseline:');
const fuld = nud(14, false);
check('14 gemte giver stadig et kort (ikke null)', fuld !== null && fuld !== undefined);
check('14 gemte -> ANDET budskab end 13 gemte', fuld && fuld.stort !== nud(13, false).stort);
check('14 gemte -> ingen nedtaelling tilbage', fuld && fuld.naerhed === null, JSON.stringify(fuld && fuld.naerhed));
check('20 gemte (over maalet) -> samme faerdig-budskab, ikke negativ optaelling',
  JSON.stringify(nud(20, false)) === JSON.stringify(fuld), altText(nud(20, false)));

// ── SRT leveret: baseline er ikke laengere maalet ────────────────────────────
console.log('Efter leveret ordination:');
check('srtAktiv -> null (nudgingen tier bevidst)', nud(5, false, true) === null);
check('srtAktiv gaelder ogsaa ved fuld baseline', nud(14, false, true) === null);

// ── Tone og sprog: de tre negative krav ──────────────────────────────────────
// De er negative og derfor lette at bryde uden at opdage det. En vagt er billigere end
// en gennemlaesning hver gang nogen retter et ord.
console.log('Tone (klient-sprog, ingen pres, intet loefte om at behandling ikke kan starte):');
const KLINISKE_ORD = /ATST|søvneffektivitet|estimat|titrer|SRT|compliance|adhærens/i;
// 🔴 STRAMMET 9/8, fordi vagten fyrede paa sin egen kur: den nye paedagogiske ordlyd siger
// »hvornaar du skal gaa i seng og staa op«, og DET er den kliniske instruktion, ikke pres.
// En vagt der er gron paa uklar tekst og roed paa klar tekst, presser mig til at skrive
// daarligere dansk. Pres-formerne der faktisk betyder noget, handler om dagbogs-PLIGTEN.
const PRES_ORD = /du mangler|du skal (huske|udfylde|svare|sende|aflevere)|husk at|for sent|ikke nok|du har glemt|advarsel/i;
const START_LOEFTE = /kan (først|ikke) (starte|begynde)|venter på|inden vi kan/i;
for (const [navn, r] of [['0 gemte', nud(0, false)], ['11 gemte', nud(11, false)],
  ['13 gemte', nud(13, false)], ['14 gemte', nud(14, false)]]) {
  const t = altText(r);
  check(`${navn}: intet klinisk fagsprog`, !KLINISKE_ORD.test(t), t);
  check(`${navn}: intet pres-sprog`, !PRES_ORD.test(t), t);
  check(`${navn}: intet loefte om at behandlingen ikke kan starte`, !START_LOEFTE.test(t), t);
  check(`${navn}: ingen em dash`, !/—/.test(t), t);
  // Viktor 9/8: »ramme rigtigt fra den foerste uge« var for utydeligt for en klient.
  // Vagten holder den gamle vending vaek, saa den ikke sniger sig tilbage ved naeste rettelse.
  check(`${navn}: ingen »ramme rigtigt«-vending`, !/ramme rigtigt/i.test(t), t);
  // Og teksten skal sige hvad tallet BRUGES til, ikke bare at det er godt.
  check(`${navn}: siger hvad naetterne bruges til`, /sover om natten|gå i seng og stå op/i.test(t), t);
}

// ── Uge-gitteret (Viktor 9/8: behandlingen koerer en uge ad gangen) ──────────
// Foer: prikkerne laa i en flex-wrap uden bredde og braekkede dér hvor der tilfaeldigvis
// ikke var mere plads (MAALT: 13 pr. raekke ved 420 px). Uge 1 laa hen over to raekker.
console.log('Uge-gitter:');
const gitMatch = html.match(/function diaryUgeGitter\([\s\S]*?\n\}/);
check('diaryUgeGitter() findes i index.html', !!gitMatch);
if (!gitMatch) { console.error('\nINSTRUMENTET ER DOEDT: gitter-funktionen kunne ikke laeses.'); process.exit(3); }
function git(perioden, gemte, harIDag, bredde = 7, maal = BASELINE_MAAL_NAETTER) {
  return runInNewContext(`${gitMatch[0]}\ndiaryUgeGitter(p, g, h, b, m);`,
    { p: perioden, g: gemte, h: harIDag, b: bredde, m: maal }, { timeout: 1000 });
}
const g90 = git(90, 11, false);
check('hver raekke er praecis een uge bred', g90.uger.every(u => u.celler.length === 7 || u === g90.uger[g90.uger.length - 1]),
  JSON.stringify(g90.uger.map(u => u.celler.length)));
check('den uge klienten staar i er markeret »nu« - og kun een uge er det',
  g90.uger.filter(u => u.tilstand === 'nu').length === 1);
check('11 gemte naetter -> »nu« er uge 2', g90.uger.find(u => u.tilstand === 'nu').nr === 2,
  String(g90.uger.find(u => u.tilstand === 'nu').nr));
check('ugen foer er »gaaet«, ugen efter er »fremtid«',
  g90.uger[0].tilstand === 'gaaet' && g90.uger[2].tilstand === 'fremtid',
  g90.uger.map(u => u.tilstand).join(','));
check('dagens celle er markeret »idag« naar natten ikke er udfyldt',
  g90.uger[1].celler[4] === 'idag', g90.uger[1].celler.join(','));
check('er dagens nat udfyldt, findes der INGEN »idag«-celle',
  git(90, 11, true).uger.every(u => !u.celler.includes('idag')));

// 🔴 Det Viktor faktisk klagede over: 90 dage gav 13 raekker, hvoraf 11 var tomme.
check('90 dage tegner 3 raekker, ikke 13', g90.uger.length === 3, String(g90.uger.length));
// 🔴 Viktor 9/8: paa den ALLERFOERSTE morgen maa der ikke staa »og N uger mere i dit forloeb«.
// Han laeste den som tvivl om forloebets laengde, ikke som overblik.
const g0 = git(90, 0, false);
check('allerfoerste morgen: ingen »og N uger mere«', g0.skjulte === 0, JSON.stringify(g0.skjulte));
check('allerfoerste morgen viser stadig sin egen uge + een frem', g0.uger.length === 2, String(g0.uger.length));
// Med 1 nat staar klienten stadig i uge 1, saa der skjules 11 uger (13 - egen - een frem).
// Ved 11 naetter staar hun i uge 2, og saa er det 10. Tallet foelger ugen, ikke natten.
check('POS-KTRL: fra dag 2 kommer linjen tilbage', git(90, 1, false).skjulte === 11,
  String(git(90, 1, false).skjulte));
check('resten staar som eet tal, ikke som tomme raekker', g90.skjulte === 10, String(g90.skjulte));
check('gaaede uger klappes ALDRIG sammen (de baerer det klienten har gjort)',
  git(90, 60, false).uger.filter(u => u.tilstand === 'gaaet').length === 8,
  String(git(90, 60, false).uger.filter(u => u.tilstand === 'gaaet').length));
// NEG-KTRL paa sammenklapningen: en kort periode maa ikke faa en »og 0 uger mere«-linje.
check('14-dages periode klapper INTET sammen', git(14, 3, false).skjulte === 0);
// 21 dage = 3 uger. Med »nu« i uge 1 og een uge frem er der praecis EEN uge tilbage at
// skjule, og saa skal den tegnes: linjen ville koste noejagtig den raekke den sparer.
// (28 dage giver 2 skjulte og klappes derfor sammen. Graensen er maalt, ikke valgt.)
check('en enkelt skjult uge klappes ikke sammen (linjen ville koste det den sparer)',
  git(21, 3, false).skjulte === 0 && git(21, 3, false).uger.length === 3,
  JSON.stringify({ uger: git(21, 3, false).uger.length, skjulte: git(21, 3, false).skjulte }));

// Baseline-skellet foelger uge-enheden, ellers paastaar det en graense midt i en uge.
check('skellet ligger efter uge 2 ved 7 pr. raekke (14 naetter)',
  g90.uger[1].baselineSlutter === true && g90.uger[0].baselineSlutter === false);
check('ved 14 pr. raekke ligger skellet efter uge 1',
  git(90, 11, false, 14).uger[0].baselineSlutter === true);
check('ingen skel naar maalet falder INDE i en uge (10 naetter, 7 pr. raekke)',
  git(90, 3, false, 7, 10).uger.every(u => !u.baselineSlutter));
check('ingen skel naar perioden ER baseline (intet efter grænsen at skille fra)',
  git(14, 3, false).uger.every(u => !u.baselineSlutter));

// POS-KTRL: kan gitteret overhovedet se anderledes ud? 14 pr. raekke skal give halvt saa
// mange celler pr. uge-objekt, ellers maaler bredde-parameteren ingenting.
check('POS-KTRL: bredde 14 giver 14 celler i foerste raekke',
  git(90, 11, false, 14).uger[0].celler.length === 14,
  String(git(90, 11, false, 14).uger[0].celler.length));
check('0 naetter gemt -> »nu« er foerste uge, og foerste celle er dagens',
  git(90, 0, false).uger[0].tilstand === 'nu' && git(90, 0, false).uger[0].celler[0] === 'idag');
check('sidste uge er kortere naar perioden ikke gaar op (90 = 12x7 + 6)',
  git(90, 89, true).uger[git(90, 89, true).uger.length - 1].celler.length === 6,
  String(git(90, 89, true).uger[git(90, 89, true).uger.length - 1].celler.length));

// ── Afsendelse og afslutning (Viktor 9/8: livstegn pr. nat · intet fejltryk) ─
// Strukturelle naale. De maaler kilden, ikke en ren funktion, og det er med vilje: begge
// egenskaber ER strukturelle (hvornaar kaldes der, og hvor staar knappen i dokumentet).
console.log('Afsendelse og afslutning:');
const sendFn = html.match(/async function autoSendEfterNat\([\s\S]*?\n\}/);
check('autoSendEfterNat() findes', !!sendFn);
if (sendFn) {
  check('sender ved HVER nat, ikke kun ugens sidste', !/% *7/.test(sendFn[0]),
    'kilden gater stadig paa en uge-rest');
  check('sender kun ved en NY nat (ikke ved en rettelse)', /erNyEntry/.test(sendFn[0]));
  check('sender kun naar der findes en automatisk vej', /autoSendEnabled\(\)/.test(sendFn[0]));
  check('en fejlet forsendelse taber ikke natten (hele dagbogen sendes hver gang)',
    /byggDiaryPayload\(false\)/.test(sendFn[0]), sendFn[0].slice(0, 120));
}
// 🔴 Stop-handlingen maa ikke kunne rammes ved et fejltryk: den skal staa EFTER
// privatlivsteksten i dokumentet, og den maa ikke baere knap-klasserne fra stakken foroven.
const iStop = html.indexOf('id="diary-finish-now-btn"');
const iPriv = html.indexOf('id="diary-privacy"');
const iStart = html.indexOf('id="diary-start-btn"');
check('stop-linjen staar efter privatlivsteksten', iStop > iPriv && iPriv > 0,
  JSON.stringify({ iStop, iPriv }));
check('stop-linjen staar efter dagens knap', iStop > iStart && iStart > 0);
const stopTag = html.slice(iStop - 120, iStop + 60);
check('stop-linjen er IKKE stylet som en knap i stakken', !/btn-primary|btn-secondary/.test(stopTag), stopTag);
// POS-KTRL paa naalen selv: dagens knap BAERER knap-klassen, saa maalingen ovenfor kan
// skelne de to. Uden den ville »ingen knap-klasse« ogsaa vaere gron paa et tomt dokument.
check('POS-KTRL: dagens knap baerer stadig btn-primary',
  /btn-primary[^>]*id="diary-start-btn"|id="diary-start-btn"[^>]*btn-primary/.test(html)
  || /<button class="btn-primary" id="diary-start-btn"/.test(html));

// ── Drift mod appens konstant ────────────────────────────────────────────────
// Maalet er appens, ikke denne fils praeference: SRTMotor.minimumBaselineNætter.
// Er app-repoet ikke til stede, er dette UMAALT. Det skrives ud som UMAALT og taelles
// separat: et gront resultat maa ikke kunne daekke over »jeg kunne ikke maale«.
console.log('Drift mod PsykologInvitation:');
const SWIFT = '/Users/viktornielsen/Documents/MEMTEM/PsykologInvitation/PsykologInvitation/SRTMotor.swift';
if (existsSync(SWIFT)) {
  const m = readFileSync(SWIFT, 'utf8').match(/static let minimumBaselineNætter\s*=\s*(\d+)/);
  check('SRTMotor.minimumBaselineNætter kunne laeses', !!m);
  if (m) check(`web ${BASELINE_MAAL_NAETTER} == app ${m[1]}`, Number(m[1]) === BASELINE_MAAL_NAETTER);
} else {
  umaalt++;
  console.log(`  ? UMAALT: app-repoet findes ikke paa ${SWIFT} - drift mod SRTMotor.minimumBaselineNætter er IKKE maalt her`);
}

console.log(`\n${ok} ok · ${fejl} fejl · ${umaalt} UMAALT`);
process.exit(fejl ? 1 : 0);
