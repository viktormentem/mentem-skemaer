// Varighed-kontrakt: udfyldnings-varigheden (Viktor-GO Q15) maales paa svar-GRAENSER,
// mangler helt naar den ikke er maalt, og maerker frem for at klemme.
//
// HVORFOR DEN FINDES. Q15 er en NY DATAKATEGORI om klienten (adfaerdsmetadata), og de tre
// ting der kan gaa galt er alle tavse:
//   1. et uroert skema faar `0` i stedet for at mangle  -> medianen traekkes mod nul af
//      klienter der aldrig roerte skemaet, og intet melder fejl
//   2. loftet KLEMMER 20 timer ned til 600 sek           -> et opfundet tal der ligner
//      en maaling, og som er umuligt at skelne fra en aegte lang udfyldning
//   3. vaeguret springer (NTP, tidszone)                 -> negativ varighed, eller en
//      time lagt til, i en enkelt klients tal
//
// 🔴 CELLERNE RAMMER GENNEM DEN RIGTIGE index.html, ikke gennem en kopi af logikken.
//    Funktionerne lever i et `<script type="module">` og kan ikke importeres, saa kilden
//    UDTRAEKKES og evalueres. En kopi her ville kunne drive fra fladen uden at noget melder.
//
// Koeres:  node test/varighed-kontrakt.mjs        Selvtest: node test/varighed-kontrakt.mjs --selftest
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildPayload } from '../mentem-skema-core.js';

const HER = dirname(fileURLToPath(import.meta.url));
const INDEX = join(HER, '..', 'index.html');

let fejl = 0;
const ok = (c, n, hvorfor) => { console.log((c ? '  ✓ ' : '  ✗ FAIL ') + n + (c ? '' : '\n        ' + (hvorfor || ''))); if (!c) fejl++; };
const doed = (m) => { console.error('INSTRUMENTET ER DOEDT, ingen dom: ' + m); process.exit(3); };

const kilde = readFileSync(INDEX, 'utf8');

// ── 0. INSTRUMENTETS EGEN KONTROL ────────────────────────────────────────────────────
// Naalen er »udtraek modulet fra index.html og evaluer det«. Fejler udtraekket, maa denne
// fil IKKE afgive en dom: et tomt udtraek ville give nul fejl og se groent ud.
const START = 'const VARIGHED_LOFT_SEK';
const SLUT  = 'function startForm()';
const i0 = kilde.indexOf(START);
const i1 = kilde.indexOf(SLUT);
if (i0 < 0) doed('kunne ikke finde "' + START + '" i index.html');
if (i1 < 0 || i1 < i0) doed('kunne ikke finde "' + SLUT + '" efter modulet i index.html');
const fragment = kilde.slice(i0, i1);
for (const navn of ['varighedStart', 'varighedNoterSvar', 'varighedResultat', 'varighedNu']) {
  if (!fragment.includes('function ' + navn)) doed('udtraekket manglede ' + navn + '()');
}

// POS-KTRL paa selve evalueringen: modulet skal kunne koere OG svare paa noget vi kender.
let M;
try {
  M = new Function(fragment + '\nreturn { VARIGHED_LOFT_SEK, varighedNu, varighedStart, varighedNoterSvar, varighedResultat, varighedsUr, VARIGHED_UR_ER_MONOTONT };')();
} catch (e) { doed('modulet kunne ikke evalueres: ' + (e && e.message)); }
if (typeof M.varighedResultat !== 'function') doed('varighedResultat kom ikke ud af evalueringen');
if (M.varighedResultat(['who5']) !== null) doed('POS-KTRL: et ustartet ur skal give null, ikke et objekt');
console.log('  · instrument-kontrol groen: modulet udtrukket fra index.html og evalueret');

// Et styret ur, saa cellerne maaler logikken og ikke maskinens hastighed.
let UR = 0;
const spol = (sek) => { UR += sek * 1000; };
const medStyretUr = (fn) => {
  const rigtig = M.varighedNu;
  // varighedNu laeses via closure i modulet; vi kan ikke erstatte den, saa vi styrer
  // `performance.now` i stedet, hvilket er praecis den kilde modulet valgte.
  const gemt = globalThis.performance;
  globalThis.performance = { now: () => UR };
  try { return fn(); } finally { globalThis.performance = gemt; void rigtig; }
};

// ── 1. GRAENSE-MODELLEN: summen af delene ER helheden ────────────────────────────────
UR = 0;
let r = medStyretUr(() => {
  M.varighedStart();
  spol(61);  M.varighedNoterSvar('who5');
  spol(48);  M.varighedNoterSvar('wsas');
  spol(132); M.varighedNoterSvar('gad7');
  spol(205); M.varighedNoterSvar('phq9');
  return M.varighedResultat(['who5', 'wsas', 'gad7', 'phq9']);
});
ok(r && r.who5 === 61 && r.wsas === 48 && r.gad7 === 132 && r.phq9 === 205,
   'hvert skema faar tiden fra det forriges sidste svar til sit eget',
   JSON.stringify(r));
ok(r && r.ialt === 61 + 48 + 132 + 205,
   'ialt = summen af delene (446)', 'ialt=' + (r && r.ialt));
ok(r && Array.isArray(r.afbrudt) && r.afbrudt.length === 0,
   'ingen afbrudt naar alt er under loftet');

// ── 2. 🔴 ET UROERT SKEMA FAAR INTET TAL, IKKE ET NUL ────────────────────────────────
// Cellen der baerer VAS-fejlen: `vasBlock` forudfylder til 50 og taeller som besvaret,
// saa et VAS-skema kan afleveres uden en eneste beroering.
UR = 0;
r = medStyretUr(() => {
  M.varighedStart();
  spol(30); M.varighedNoterSvar('who5');
  spol(40); M.varighedNoterSvar('gad7');       // wsas blev ALDRIG roert
  return M.varighedResultat(['who5', 'wsas', 'gad7']);
});
ok(r && !('wsas' in r), 'uroert skema mangler HELT i objektet (ikke wsas: 0)', JSON.stringify(r));
ok(r && r.gad7 === 40, 'det naeste skema maaler stadig fra det forrige MAALTE svar', JSON.stringify(r));
ok(r && r.ialt === 70, 'ialt daekker hele udfyldningen selv naar et skema mangler', 'ialt=' + (r && r.ialt));

// ── 3. 🔴 LOFTET MAERKER, DET KLEMMER IKKE ───────────────────────────────────────────
UR = 0;
r = medStyretUr(() => {
  M.varighedStart();
  spol(20);    M.varighedNoterSvar('who5');
  spol(72000); M.varighedNoterSvar('phq9');    // 20 timer: hun lukkede fanen og kom igen
  return M.varighedResultat(['who5', 'phq9']);
});
ok(r && r.afbrudt.includes('phq9'), 'et skema over loftet maerkes afbrudt', JSON.stringify(r && r.afbrudt));
ok(r && r.phq9 === 72000, 'og tallet er det MAALTE, ikke klemt ned til loftet', 'phq9=' + (r && r.phq9));
ok(r && !r.afbrudt.includes('who5'), 'det korte skema i samme udfyldning maerkes IKKE');
ok(M.VARIGHED_LOFT_SEK === 600, 'loftet er 600 sek som specen sagde', 'loft=' + M.VARIGHED_LOFT_SEK);

// ── 4. Ingen svar overhovedet -> INGEN maaling, ikke et nul-objekt ───────────────────
UR = 0;
r = medStyretUr(() => { M.varighedStart(); spol(300); return M.varighedResultat(['who5', 'wsas']); });
ok(r === null, 'en udfyldning uden et eneste svar giver null, ikke {ialt: 300}', JSON.stringify(r));

// ── 5. 🔴 MONOTONT UR: performance.now, ikke Date.now ────────────────────────────────
// Et vaegur der springer bagud giver en NEGATIV varighed i en enkelt klients tal.
ok(/typeof performance\.now === 'function'/.test(fragment),
   'kilden vaelger performance.now naar den findes');
ok(!/varighedNu\(\)\s*\{\s*return Date\.now/.test(fragment),
   'varighedNu er ikke haardkodet til Date.now');
ok(/VARIGHED_UR_ER_MONOTONT/.test(fragment) && (fragment.match(/VARIGHED_UR_ER_MONOTONT/g) || []).length >= 2,
   'kilden vaelges EEN gang og genbruges (de to ure maa aldrig blandes)');

// ── 6. buildPayload baerer feltet, og UDELADER det naar der intet er maalt ───────────
// 🔴 FELTET BOR I `.data`, IKKE I ROD. buildPayload envelope-wrapper den flade nyttelast
//    (`buildIngestKonvolut`), saa roden baerer schemaType/clientTimestamp og INTET andet.
//    Min egen foerste udgave af denne celle laeste `p.varighed` og gik roed paa kode der
//    var rigtig. Nyttelastens FORM er en maaling, ikke noget man husker.
const svar = { who5: { 0: 3, 1: 3, 2: 3, 3: 3, 4: 3 } };
const flad = (meta) => buildPayload(svar, Object.assign({ name: '' }, meta)).data;
let p = flad({ varighed: { who5: 61, ialt: 61, afbrudt: [] } });
ok(p && p.varighed && p.varighed.who5 === 61 && p.varighed.ialt === 61,
   'buildPayload laegger varigheden i nyttelasten (.data)', JSON.stringify(p && p.varighed));
ok(!('varighed' in flad({})),
   'uden en maaling findes feltet SLET IKKE (ikke null, ikke {})');
ok(!('varighed' in flad({ varighed: {} })),
   'et tomt objekt taeller som "ikke maalt", ikke som "maalt til nul"');
ok(!('varighed' in flad({ varighed: null })),
   'null taeller som "ikke maalt"');
// POS-KTRL paa selve `flad`: en doed accessor ville give tre tavse groenne ovenfor.
ok(flad({}) && typeof flad({}).version === 'number',
   'POS-KTRL: .data er den flade nyttelast (den baerer `version`), saa de tre nuller ovenfor er maalte');

// ── 7. Fladen starter uret FOER den tegner, og noterer BEGGE svar-former ─────────────
ok(/function startForm\(\)\s*\{\s*\n\s*varighedStart\(\);[^\n]*\n\s*renderForm\(\);/.test(kilde),
   'startForm kalder varighedStart FOER renderForm (laesetiden paa foerste skema taeller med)');
const radioBlok = kilde.slice(kilde.indexOf('function radioBlock'), kilde.indexOf('function vasBlock'));
ok(/varighedNoterSvar\(id\)/.test(radioBlok), 'radio-svar noteres');
const vasBlok = kilde.slice(kilde.indexOf('function vasBlock'), kilde.indexOf('function updateProgress'));
ok(/varighedNoterSvar\(id\)/.test(vasBlok), 'VAS-beroering noteres');
ok(/varighedResultat\(selected\)/.test(kilde),
   'resultatet deles ud i KLIENT_RAEKKEFOELGE-orden (`selected`), ikke i ?s=-orden');

// ── 8. SELVTEST: cellerne skal kunne gaa ROEDE ───────────────────────────────────────
if (process.argv.includes('--selftest')) {
  console.log('\n  SELVTEST (mutanter skal DRAEBES):');
  let draebt = 0, i = 0;
  const mut = (navn, kode, celle) => {
    i++;
    let m;
    try { m = new Function(kode + '\nreturn { varighedStart, varighedNoterSvar, varighedResultat, VARIGHED_LOFT_SEK };')(); }
    catch (e) { console.log('    ✓ mutant ' + i + ' (' + navn + ') doede paa parse'); draebt++; return; }
    UR = 0;
    const gemt = globalThis.performance; globalThis.performance = { now: () => UR };
    let r2 = null;
    try { r2 = celle(m); } catch (e) { r2 = 'kastede'; } finally { globalThis.performance = gemt; }
    if (r2 === true) { console.log('    ✗ mutant ' + i + ' (' + navn + ') OVERLEVEDE'); fejl++; }
    else { console.log('    ✓ mutant ' + i + ' (' + navn + ') draebt'); draebt++; }
  };
  // mutant 1: uroert skema faar 0 i stedet for at mangle
  mut('uroert -> 0', fragment.replace('if (t == null) continue;', 'if (t == null) { ud[id] = 0; continue; }'),
      (m) => { m.varighedStart(); spol(30); m.varighedNoterSvar('who5'); const r3 = m.varighedResultat(['who5', 'wsas']); return !('wsas' in r3); });
  // mutant 2: loftet klemmer i stedet for at maerke
  mut('loft klemmer', fragment.replace('ud[id] = sek;', 'ud[id] = Math.min(sek, VARIGHED_LOFT_SEK);'),
      (m) => { m.varighedStart(); spol(72000); m.varighedNoterSvar('phq9'); return m.varighedResultat(['phq9']).phq9 === 72000; });
  // mutant 3: hvert skema maaler fra t0 i stedet for fra forrige graense
  mut('maaler fra t0', fragment.replace('forrige = t;', ''),
      (m) => { m.varighedStart(); spol(10); m.varighedNoterSvar('who5'); spol(20); m.varighedNoterSvar('wsas'); return m.varighedResultat(['who5', 'wsas']).wsas === 20; });
  console.log('  mutanter: ' + i + ' · draebt ' + draebt);
}

console.log(fejl === 0 ? '\n🟢 varighed-kontrakt: alt groent' : '\n🔴 varighed-kontrakt: ' + fejl + ' fejl');
process.exit(fejl === 0 ? 0 : 1);
