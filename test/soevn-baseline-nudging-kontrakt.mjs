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
const PRES_ORD = /du mangler|du skal|husk at|for sent|ikke nok|fejl|advarsel/i;
const START_LOEFTE = /kan (først|ikke) (starte|begynde)|venter på|inden vi kan/i;
for (const [navn, r] of [['0 gemte', nud(0, false)], ['11 gemte', nud(11, false)],
  ['13 gemte', nud(13, false)], ['14 gemte', nud(14, false)]]) {
  const t = altText(r);
  check(`${navn}: intet klinisk fagsprog`, !KLINISKE_ORD.test(t), t);
  check(`${navn}: intet pres-sprog`, !PRES_ORD.test(t), t);
  check(`${navn}: intet loefte om at behandlingen ikke kan starte`, !START_LOEFTE.test(t), t);
  check(`${navn}: ingen em dash`, !/—/.test(t), t);
}

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
