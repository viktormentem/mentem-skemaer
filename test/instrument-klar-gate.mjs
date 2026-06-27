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
  INSTRUMENTER, INSTRUMENT_MODULER,
  WHO5_INSTRUMENT, PHQ9_INSTRUMENT, GAD7_INSTRUMENT,
  CAS1_INSTRUMENT_SLOT, WSAS_INSTRUMENT_SLOT, WHODAS_INSTRUMENT_SLOT,
} from '../mentem-skema-core.js';

let fejl = 0;
function ok(cond, navn) { console.log((cond ? '  ✓ ' : '  ✗ FAIL ') + navn); if (!cond) fejl++; }

console.log('Instrument KLAR-gate guard (licens-gate + a11y, spec §5):');

// ── 1. Maskinel licens-gate ─────────────────────────────────────────────────
const aktive = INSTRUMENT_MODULER.filter(m => m.KLAR);
const slots  = INSTRUMENT_MODULER.filter(m => !m.KLAR);
ok(aktive.length === 3, 'praecis 3 aktive moduler (KLAR:true)');
ok(slots.length === 3, 'praecis 3 scaffold-slots (KLAR:false)');

// Intet KLAR:false-modul maa vaere i INSTRUMENTER -> ueksponerbart via ?s=<skabelon>.
for (const m of slots) {
  ok(!(m.skabelon in INSTRUMENTER), `slot '${m.skabelon}' (KLAR:false) er IKKE i INSTRUMENTER (licens-gate)`);
  ok(Array.isArray(m.scoredItems) && m.scoredItems.length === 0, `slot '${m.skabelon}' har 0 item-tekst (ingen fabrikation)`);
  ok(typeof m.licensStatus === 'string' && m.licensStatus.length > 0, `slot '${m.skabelon}' baerer licensStatus ('${m.licensStatus}')`);
}

// Hvert INSTRUMENTER-opslag peger paa et KLAR:true-modul (intet andet sluppet ind).
for (const [key, modul] of Object.entries(INSTRUMENTER)) {
  ok(modul.KLAR === true, `INSTRUMENTER['${key}'] er KLAR:true`);
  ok(modul.skabelon === key, `INSTRUMENTER['${key}'].skabelon matcher noeglen`);
}
ok(Object.keys(INSTRUMENTER).sort().join(',') === 'gad7,phq9,who5', 'INSTRUMENTER = praecis {who5, phq9, gad7}');

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

console.log(fejl === 0 ? '\nINSTRUMENT KLAR-GATE GUARD PASSED ✅' : '\nINSTRUMENT KLAR-GATE GUARD FAILED ❌ (' + fejl + ')');
process.exit(fejl === 0 ? 0 : 1);
