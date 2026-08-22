// Instrument KLAR-gate guard (extensibilitets-beskyttelse, spec-instrument-kerne-genbygning §5).
//
// To maskinelle invarianter, så et licens-pending instrument ALDRIG kan lække til preview/prod:
//   1. LICENS-GATE: intet KLAR:false-modul er i INSTRUMENTER (eller dermed i ?s=<skabelon>-routing).
//      Et KLAR:false-slot er defineret (struktur + licensStatus) men 0 item-tekst og uregistreret.
//   2. A11Y: renderInstrument giver hver radio et tilgaengeligt navn = ordlyd-LABEL (ikke bar value).
// Koeres: node test/instrument-klar-gate.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  INSTRUMENTER, INSTRUMENTER_REVIEW, INSTRUMENT_MODULER, maaVisesForKlient, REVIEW_PARAM,
  WHO5_INSTRUMENT, PHQ9_INSTRUMENT, GAD7_INSTRUMENT, ESS_INSTRUMENT,
  CAS1_INSTRUMENT_SLOT, WSAS_INSTRUMENT_SLOT, WHODAS_INSTRUMENT_SLOT,
  OFFENTLIGT_KLAR,
  INSTRUMENT_LICENS,
} from '../mentem-skema-core.js';

let fejl = 0;
function ok(cond, navn) { console.log((cond ? '  ✓ ' : '  ✗ FAIL ') + navn); if (!cond) fejl++; }

console.log('Instrument KLAR-gate guard (licens-gate + a11y, spec §5):');

// ── 1. Maskinel licens-gate ─────────────────────────────────────────────────
const aktive = INSTRUMENT_MODULER.filter(m => m.KLAR);
const slots  = INSTRUMENT_MODULER.filter(m => !m.KLAR);
ok(aktive.length === 4, 'praecis 4 fuldt formede moduler (KLAR:true)');
// 🔵 4, ikke 3: `ISI_INSTRUMENT_SLOT` kom med fra forligs-grenen (8e24319). Tallet er
// opdateret frem for fjernet, men det er den AFLEDTE invariant nedenfor der baerer , et
// haardkodet tal raadner ved naeste modul, og det gjorde det praecis her.
ok(slots.length === 4, 'praecis 4 scaffold-slots (KLAR:false)');
// 🔵 OG DEN AFLEDTE INVARIANT BLIVER STAAENDE VED SIDEN AF TALLENE (forlig 22-08).
// De to haardkodede tal ovenfor er MAIN's og er rigtige i dag. Men et tal raadner naar et
// modul mere lander, og gaten faelder saa paa sit ANTAL frem for paa sin egenskab , det
// skete for mig 19-08 med `slots.length === 3`. Invarianten kan ikke raadne:
ok(aktive.length + slots.length === INSTRUMENT_MODULER.length,
   `hvert modul er enten aktivt eller slot (${aktive.length} + ${slots.length} = ${INSTRUMENT_MODULER.length})`);

// ── 🔴 ENTYDIGHED: ÉT modul pr. skabelon. Tilfoejet ved forliget 22-08. ──────────
// HVORFOR DEN FINDES, og fundet er saa konkret som det bliver: da de to ESS-linjer blev
// merget, lagde git BEGGE `ESS_INSTRUMENT` (main) og `ESS_INSTRUMENT_SLOT` (grenen) ind i
// INSTRUMENT_MODULER , to moduler med `skabelon: 'ess'`, hver med sin egen ordlyd og sin
// egen attribution , UDEN en eneste konfliktmarkoer. De laa forskellige steder i filen, saa
// der var ikke noget for git at vaere i tvivl om.
//
// 🔴 OG INGEN AF HUSETS GATES SAGDE FRA. Maalt paa praecis den dublet, foer denne assert:
//     instrument-klar-gate  roed, men paa TAELLINGEN »praecis 3 scaffold-slots«
//     licens-profil-gate    roed, men paa en SyntaxError fra merget
//     e2e-ess-review        roed, men paa en locator der timede ud
//     3l · batteri · selftest   GROENNE
// Tre roede, og ingen af dem sagde »der er to ESS«. **En dom der peger et andet sted hen
// end sin aarsag, laerer laeseren at gaten er stoej.**
//
// 🔵 Registreringsloekken skjuler den aktivt: `INSTRUMENTER[modul.skabelon] = modul` lader
// den sidste vinde i tavshed. Med to moduler der begge er spaerret, ser resultatet endda
// KORREKT ud , og den dag den ene flippes, afgoer raekkefoelgen i en liste hvilken ordlyd
// en klient faar. Det er ikke en teoretisk fejl, det er en tavs en.
{
  const set = new Set();
  const dubletter = [];
  for (const m of INSTRUMENT_MODULER) {
    if (set.has(m.skabelon)) dubletter.push(m.skabelon);
    set.add(m.skabelon);
  }
  ok(dubletter.length === 0,
     `hver skabelon findes PRAECIS een gang i INSTRUMENT_MODULER (dubletter: ${dubletter.join(', ') || 'ingen'})`);
  ok(set.size === INSTRUMENT_MODULER.length,
     `${set.size} distinkte skabeloner af ${INSTRUMENT_MODULER.length} moduler`);
}

// Intet KLAR:false-modul maa vaere i INSTRUMENTER -> ueksponerbart via ?s=<skabelon>.
//
// 🔴 »0 items« VAR reglen mod fabrikation, og den kunne ikke skelne to ting: et slot uden
// tekst, og et slot med LICENSERET VERBATIM tekst der endnu ikke maa vises. ESS er den
// anden: Special Terms 140135 er i hus siden 26/6, den danske AU1.0-tekst ligger paa disk,
// og eksponeringen er spaerret af en UOPFYLDT betingelse (screenshot-review), ikke af at
// teksten mangler. Under den gamle regel kunne den skaerm ikke bygges , og uden skaermen
// kan screenshots ikke skydes, og uden screenshots kan betingelsen aldrig opfyldes.
// **Gaten spaerrede den ENESTE vej ud af den tilstand den selv haandhaevede.**
// ⇒ Reglen er ikke svaekket, den er gjort MAALBAR: har et slot items, skal det navngive den
// licenserede kilde de er taget fra. Foer kunne gaten kun sige »der er ingen tekst«; nu kan
// den sige »teksten har en kilde«. Fabrikeret tekst har ingen.
for (const m of slots) {
  ok(!(m.skabelon in INSTRUMENTER), `slot '${m.skabelon}' (KLAR:false) er IKKE i INSTRUMENTER (licens-gate)`);
  const harItems = Array.isArray(m.scoredItems) && m.scoredItems.length > 0;
  if (harItems) {
    ok(typeof m.verbatimKilde === 'string' && m.verbatimKilde.length > 0,
       `slot '${m.skabelon}' har ${m.scoredItems.length} items OG navngiver sin verbatim-kilde (ingen fabrikation)`);
  } else {
    ok(Array.isArray(m.scoredItems) && m.scoredItems.length === 0,
       `slot '${m.skabelon}' har 0 item-tekst (ingen fabrikation)`);
  }
  ok(typeof m.licensStatus === 'string' && m.licensStatus.length > 0, `slot '${m.skabelon}' baerer licensStatus ('${m.licensStatus}')`);
  // 🔴 FORM, ikke kun ANTAL. Foerste udgave af ESS-slottet bar items som bare STRENGE, og
  // gaten var groen: den taalte `.length`. `renderInstrument` laeser `it.key`/`it.text`, saa
  // skaermen ville have rendret otte tomme spoergsmaal. **Et antal kan ikke svare paa et
  // spoergsmaal om form** , husets egen regel fra 19/8, her paa mit eget arbejde.
  for (const it of (m.scoredItems || [])) {
    ok(it && typeof it.key === 'string' && it.key.length > 0 && typeof it.text === 'string' && it.text.length > 0,
       `slot '${m.skabelon}' item baerer baade key og text (render-kontrakt)`);
  }
}

// 🔴 OG DEN VIGTIGSTE: et slot med items maa ALDRIG kunne naa fladen. Den gamle gate fik
// dette gratis af »0 items«; nu hvor items er tilladt, skal spaerringen staa for sig selv.
for (const m of slots.filter(x => Array.isArray(x.scoredItems) && x.scoredItems.length > 0)) {
  ok(!OFFENTLIGT_KLAR.includes(m.skabelon),
     `slot '${m.skabelon}' har verbatim items og staar IKKE paa OFFENTLIGT_KLAR (klientvendt spaerring)`);
  const lic = INSTRUMENT_LICENS[m.skabelon];
  ok(lic && lic.grundlag === 'B' && Array.isArray(lic.betingelser) && lic.betingelser.some(b => b.status === 'ikke opfyldt'),
     `slot '${m.skabelon}' har form B med mindst een UOPFYLDT betingelse (ellers hoerer den ikke til som slot)`);
}

// Hvert INSTRUMENTER-opslag peger paa et KLAR:true-modul (intet andet sluppet ind).
for (const [key, modul] of Object.entries(INSTRUMENTER)) {
  ok(modul.KLAR === true, `INSTRUMENTER['${key}'] er KLAR:true`);
  ok(modul.skabelon === key, `INSTRUMENTER['${key}'].skabelon matcher noeglen`);
}
ok(Object.keys(INSTRUMENTER).sort().join(',') === 'gad7,phq9,who5', 'INSTRUMENTER = praecis {who5, phq9, gad7}');

// ── 1b. DEN ANDEN AKSE: bygget, ikke godkendt ───────────────────────────────
// KLAR svarer paa »er modulet fuldt formet«. klientGodkendt svarer paa »maa en klient se
// det«. Et instrument der er KLAR og IKKE godkendt hoerer i INSTRUMENTER_REVIEW og
// ingenting andet: det skal kunne rendres (screenshot-review ER betingelsen) og maa aldrig
// kunne rammes af et klient-link. Faelder ogsaa hvis nogen flipper klientGodkendt uden at
// have skrevet betingelserne opfyldt i INSTRUMENT_LICENS (se licens-3l-gate.mjs).
ok(ESS_INSTRUMENT.KLAR === true, 'ess er KLAR:true (fuldt formet, verbatim tekst paa plads)');
ok(ESS_INSTRUMENT.klientGodkendt === false, 'ess er klientGodkendt:false (Mapi screenshot-review udestaar)');
ok(!('ess' in INSTRUMENTER), 'ess er IKKE i INSTRUMENTER -> intet klient-link kan naa den');
ok('ess' in INSTRUMENTER_REVIEW, 'ess ER i INSTRUMENTER_REVIEW -> skaermen kan fotograferes');
ok(ESS_INSTRUMENT.scoredItems.length === 8, 'ess har 8 verbatim items');
ok(maaVisesForKlient(ESS_INSTRUMENT) === false, 'maaVisesForKlient(ess) = false');
// Fail-open paa et MANGLENDE felt er med vilje: et modul der ikke kender klientGodkendt maa
// ikke forsvinde tavst fra Viktors egen flade. Kun eksplicit false spaerrer.
ok(maaVisesForKlient({ KLAR: true }) === true, 'modul UDEN klientGodkendt-felt opfoerer sig som godkendt (ingen tavs amputation)');
ok(maaVisesForKlient({ KLAR: false, klientGodkendt: true }) === false, 'KLAR:false spaerrer stadig, uanset klientGodkendt');
// De to registre maa ALDRIG overlappe: en skabelon i begge ville betyde at review-doeren
// ogsaa aabnede klient-doeren, og saa var der kun een doer.
const overlap = Object.keys(INSTRUMENTER).filter(k => k in INSTRUMENTER_REVIEW);
ok(overlap.length === 0, `INSTRUMENTER og INSTRUMENTER_REVIEW er disjunkte (overlap: ${overlap.length})`);
for (const [key, modul] of Object.entries(INSTRUMENTER_REVIEW)) {
  ok(modul.KLAR === true && modul.klientGodkendt === false, `INSTRUMENTER_REVIEW['${key}'] er KLAR og ikke godkendt`);
  ok(Array.isArray(modul.scoredItems) && modul.scoredItems.length > 0, `INSTRUMENTER_REVIEW['${key}'] har verbatim items (ellers intet at fotografere)`);
  ok(!!(modul.godkendelse && modul.godkendelse.krav && modul.godkendelse.status),
    `INSTRUMENTER_REVIEW['${key}'] baerer 'godkendelse' med krav + status (en spaerring uden lukke-betingelse er permanent)`);
}

// Aktive moduler er fuldt-formede (licensStatus + ikke-tom items).
for (const m of aktive) {
  ok(typeof m.licensStatus === 'string' && m.licensStatus.length > 0, `aktiv '${m.skabelon}' baerer licensStatus ('${m.licensStatus}')`);
  ok(Array.isArray(m.scoredItems) && m.scoredItems.length > 0, `aktiv '${m.skabelon}' har verbatim items`);
}
// De forventede scaffold-skabeloner findes som slots (parathed til senere indtag).
for (const slot of [CAS1_INSTRUMENT_SLOT, WSAS_INSTRUMENT_SLOT, WHODAS_INSTRUMENT_SLOT]) {
  ok(slots.includes(slot), `scaffold '${slot.skabelon}' er registreret som KLAR:false-slot`);
}

// ── 2. A11Y: per-radio tilgaengeligt navn = ordlyd-label (ikke value) ────────
// Statisk kontrakt-tjek mod renderInstrument i index.html: badge-stien (WHO-5) laegger
// "value, label" i aria-label (navnet baerer LABEL-teksten); ikke-badge-stien wrapper
// <span>label</span> om inputtet UDEN aria-label (navnet = span-teksten = label). I begge
// tilfaelde er ordlyden i navnet — aldrig den bare value alene.
const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(here, '..', 'index.html'), 'utf8');
ok(/aria-label="\$\{aria\}"/.test(html) && /const aria = instrEscAttr\(opt\.value \+ ', ' \+ opt\.label\)/.test(html),
  'badge-radio (WHO-5): tilgaengeligt navn = "value, label" (label i navnet)');
ok(/<input type="radio"[^>]*name="\$\{instrEscAttr\(item\.key\)\}" value="\$\{opt\.value\}"><span>\$\{instrEsc\(opt\.label\)\}<\/span>/.test(html),
  'ikke-badge-radio: <span>label</span> wrapper input (navn = ordlyd-label, ingen value-only aria)');
ok(/group\.setAttribute\('aria-label', instrumentStemAria\(item\.stem, item\.text\)\)/.test(html),
  'radiogroup baerer stamme+spoergsmaal som tilgaengeligt navn (ikke bar value)');

// ── 3. REVIEW-DOEREN: tre laase i routingen, maalt paa den udrullede fil ─────
// Registret alene beviser ingenting: det er index.html der afgoer hvad en URL rammer.
// Alle tre betingelser skal staa i selve opslaget, ellers er doeren ikke laast.
const reviewOpslag = /const instrumentReviewId = \(sTokens\.length === 1[\s\S]{0,400}?\) \? sTokens\[0\] : null;/.exec(html);
ok(!!reviewOpslag, 'index.html har et instrumentReviewId-opslag');
const rk = reviewOpslag ? reviewOpslag[0] : '';
ok(/INSTRUMENTER_REVIEW\[sTokens\[0\]\]/.test(rk), 'laas 1: opslaget gaar i INSTRUMENTER_REVIEW (ikke INSTRUMENTER)');
ok(/params\.get\(REVIEW_PARAM\) === '1'/.test(rk), 'laas 2: kraever eksplicit ?' + REVIEW_PARAM + '=1');
ok(/&& !ingestToken/.test(rk), 'laas 3: NAEGTER naar der er et ingest-token (et review-link maa aldrig baere et klient-token)');
// Routingen skal faktisk BRUGE id'et, ellers er opslaget dekoration.
ok(/\} else if \(instrumentReviewId\) \{\s*(?:\/\/[^\n]*\n\s*)*renderInstrument\(instrumentReviewId\);/.test(html),
  'routingen kalder renderInstrument(instrumentReviewId)');
// Og den skal ligge EFTER klient-grenen, saa et godkendt instrument aldrig kan blive
// overtaget af review-grenen.
const iKlient = html.indexOf('} else if (instrumentId) {');
const iReview = html.indexOf('} else if (instrumentReviewId) {');
ok(iKlient > 0 && iReview > iKlient, 'review-grenen staar EFTER klient-grenen i dispatchen');
// Faelles render-motor: godkendelsen skal gaelde den kode der senere sender.
ok(/const skema = INSTRUMENTER\[id\] \|\| INSTRUMENTER_REVIEW\[id\];/.test(html),
  'renderInstrument bruger SAMME motor til begge registre (godkendt skaerm = udrullet skaerm)');
// NEG-KTRL paa selve naalene: de fire regexer ovenfor skal kunne fejle. Rammer de ogsaa en
// tom streng, maaler de ingenting. (Husets regel: en gate der ikke kan blive roed, er tavs.)
const negKtrl = [
  /INSTRUMENTER_REVIEW\[sTokens\[0\]\]/, /params\.get\(REVIEW_PARAM\) === '1'/, /&& !ingestToken/,
  /const skema = INSTRUMENTER\[id\] \|\| INSTRUMENTER_REVIEW\[id\];/,
].filter(re => re.test('')).length;
ok(negKtrl === 0, `NEG-KTRL: 0 af 4 review-naale rammer en tom streng (maalt ${negKtrl})`);

console.log(fejl === 0 ? '\nINSTRUMENT KLAR-GATE GUARD PASSED ✅' : '\nINSTRUMENT KLAR-GATE GUARD FAILED ❌ (' + fejl + ')');
process.exit(fejl === 0 ? 0 : 1);
