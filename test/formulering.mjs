// formulering.mjs: Node TDD self-test for formulering-katalog + fragment-parser
// (Task 8: parse + katalog + golden ONLY. Animeret DOM-builder er næste opgave.)
//
// Verificerer:
//  1. GOLDEN_FRAGMENT === eksakt byte-lig med Python journal.formulering_link.GOLDEN_FRAGMENT.
//  2. parseFormuleringFragment + parseFelter round-tripper GOLDEN_FRAGMENT korrekt
//     (rækkefølge, fuld tekst uden afkortning, æøå decodet korrekt).
//  3. Generisk parse (vilkårlige felter, ingen afkortning af lange værdier).
//  4. BOKS_TITLER + SLOEJFER + FORMULERING_UI (renderFormulering inline-strenge) =
//     0 em-dash og 0 en-dash.
//
// Kør: node test/formulering.mjs   (exit 0 = alle grønne)

import {
  FORMULERING_NOEGLER,
  FORMULERING_BOKS_TITLER,
  FORMULERING_REKKEFOELGE,
  FORMULERING_SLOEJFER,
  FORMULERING_UI,
  parseFormuleringFragment,
  parseFelter,
  FORMULERING_GOLDEN_FRAGMENT,
} from '../mentem-skema-core.js';

let failures = 0;
function check(name, cond, detail = '') {
  if (cond) { console.log(`  ✓ ${name}`); }
  else { console.error(`  ✗ ${name} ${detail}`); failures++; }
}
function eq(name, got, want) {
  check(name, JSON.stringify(got) === JSON.stringify(want), `(got ${JSON.stringify(got)}, want ${JSON.stringify(want)})`);
}

const GOLDEN = '0123456789abcdef0123456789abcdef;s=formulering;n=Eksempel;tr=Hvad%20nu%20hvis%20jeg%20har%20glemt%20noget%20vigtigt%3F;t1=tanker%20om%20alt%20det%20der%20kan%20g%C3%A5%20galt%20i%20morgen;em=uro%20i%20maven%2C%20sp%C3%A6ndte%20skuldre%2C%20sv%C3%A6rt%20ved%20at%20slappe%20af;nu=jeg%20kan%20ikke%20stoppe%20bekymringen%2C%20n%C3%A5r%20den%20f%C3%B8rst%20er%20i%20gang;nf=hvis%20jeg%20bliver%20ved%2C%20kan%20jeg%20br%C3%A6nde%20helt%20sammen;po=hvis%20jeg%20bekymrer%20mig%20nok%2C%20er%20jeg%20forberedt%20og%20undg%C3%A5r%20problemer;t2=det%20er%20farligt%20at%20min%20bekymring%20bare%20k%C3%B8rer%20af%20sig%20selv;ad=tjekker%20ting%20flere%20gange%3B%20s%C3%B8ger%20beroligelse%20hos%20andre;tk=pr%C3%B8ver%20at%20skubbe%20tankerne%20v%C3%A6k%3B%20sk%C3%A6lder%20mig%20selv%20ud%20for%20at%20t%C3%A6nke%20s%C3%A5dan';

console.log('formulering: GOLDEN_FRAGMENT parity:');
check('FORMULERING_GOLDEN_FRAGMENT === Python-golden (byte-lig)', FORMULERING_GOLDEN_FRAGMENT === GOLDEN);

console.log('formulering: fragment-parser:');
const parsed = parseFormuleringFragment('#' + FORMULERING_GOLDEN_FRAGMENT);
check('parseFormuleringFragment strips leading # + splitter token', parsed.token === '0123456789abcdef0123456789abcdef');
check('parseFormuleringFragment params.s === formulering (raw)', parsed.params.s === 'formulering');
check('parseFormuleringFragment params.n === Eksempel (raw)', parsed.params.n === 'Eksempel');
check('parseFormuleringFragment params.tr er stadig percent-encoded (raw)', parsed.params.tr === 'Hvad%20nu%20hvis%20jeg%20har%20glemt%20noget%20vigtigt%3F');

const bokse = parseFelter(parsed.params);
check('parseFelter returnerer 9 bokse', bokse.length === 9, `(got ${bokse.length})`);
eq('parseFelter rækkefølge === FORMULERING_REKKEFOELGE', bokse.map(b => b.felt), FORMULERING_REKKEFOELGE);
check('bokse[0].felt === trigger', bokse[0].felt === 'trigger');
check('trigger vaerdi decodet fuldt korrekt', bokse[0].vaerdi === 'Hvad nu hvis jeg har glemt noget vigtigt?',
  `(got ${JSON.stringify(bokse[0].vaerdi)})`);

const nuBoks = bokse.find(b => b.felt === 'neg_metabeliefs_ukontrollerbarhed');
check('nu-felt fundet', !!nuBoks);
check('nu vaerdi === fuld dansk tekst (ingen afkortning)',
  nuBoks.vaerdi === 'jeg kan ikke stoppe bekymringen, når den først er i gang',
  `(got ${JSON.stringify(nuBoks && nuBoks.vaerdi)})`);
check('nu vaerdi indeholder INGEN "..." (ingen trunkering)', !nuBoks.vaerdi.includes('...'));
check('nu vaerdi indeholder æøå korrekt (å)', nuBoks.vaerdi.includes('å'));
check('nu vaerdi indeholder INGEN rest-percent-encoding (%C3)', !nuBoks.vaerdi.includes('%C3'));

const emBoks = bokse.find(b => b.felt === 'emotion_symptomer');
check('emotion_symptomer vaerdi indeholder æ', emBoks.vaerdi.includes('æ'), `(got ${JSON.stringify(emBoks.vaerdi)})`);
const t2Boks = bokse.find(b => b.felt === 'type2_worry');
check('type2_worry vaerdi indeholder ø', t2Boks.vaerdi.includes('ø'), `(got ${JSON.stringify(t2Boks.vaerdi)})`);

const adBoks = bokse.find(b => b.felt === 'adfaerd');
const tkBoks = bokse.find(b => b.felt === 'tankekontrol');
check('adfaerd.liste === true', adBoks.liste === true);
check('tankekontrol.liste === true', tkBoks.liste === true);
check('trigger.liste === false', bokse[0].liste === false);

check('titel felter matcher FORMULERING_BOKS_TITLER', bokse.every(b => b.titel === FORMULERING_BOKS_TITLER[b.felt]));

console.log('formulering: generisk parse (vilkårlige felter, ingen afkortning):');
const langTrigger = 'en lang udløser der ikke må afkortes';
const genBokse = parseFelter({
  s: 'formulering',
  n: 'Anna',
  tr: encodeURIComponent(langTrigger),
  t2: encodeURIComponent('meta'),
});
const genTrigger = genBokse.find(b => b.felt === 'trigger');
check('generisk trigger vaerdi === fuld tekst uden afkortning', genTrigger.vaerdi === langTrigger,
  `(got ${JSON.stringify(genTrigger.vaerdi)})`);
const genManglende = genBokse.find(b => b.felt === 'positive_metabeliefs');
check('manglende felt → vaerdi === "" (ikke undefined)', genManglende.vaerdi === '');

console.log('formulering: em-dash + en-dash fravær i klient-copy:');
for (const [felt, titel] of Object.entries(FORMULERING_BOKS_TITLER)) {
  check(`BOKS_TITLER.${felt} har 0 em-/en-dash`, !/[–—]/.test(titel), `(got ${JSON.stringify(titel)})`);
}
for (const sloejfe of FORMULERING_SLOEJFER) {
  check(`SLOEJFER[${sloejfe.id}] har 0 em-/en-dash`, !/[–—]/.test(sloejfe.tekst), `(got ${JSON.stringify(sloejfe.tekst)})`);
}
check('FORMULERING_SLOEJFER har 4 sløjfer', FORMULERING_SLOEJFER.length === 4);
for (const [navn, streng] of Object.entries(FORMULERING_UI)) {
  check(`FORMULERING_UI.${navn} har 0 em-/en-dash`, !/[–—]/.test(streng), `(got ${JSON.stringify(streng)})`);
}

console.log('formulering: NOEGLER reverse-lookup dækker hele REKKEFOELGE:');
for (const felt of FORMULERING_REKKEFOELGE) {
  const kort = Object.keys(FORMULERING_NOEGLER).find(k => FORMULERING_NOEGLER[k] === felt);
  check(`NOEGLER har kort-key for ${felt}`, !!kort, `(felt ${felt} mangler kort-key)`);
}

console.log('');
if (failures > 0) { console.error(`FORMULERING-TEST FAILED: ${failures} fejl`); process.exit(1); }
console.log('FORMULERING-TEST PASSED');
