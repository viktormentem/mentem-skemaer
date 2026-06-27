// Instrument [MYCEL v1]-emitter guard (WHO-5 + PHQ-9): laaser feltnavne + envelope-form +
// afledte felter mod spec-kat-companion-byg-klar §3 + emissionen mod kontrakt-mycel-v1 §1.
// Gate: web-submit -> [MYCEL v1] matcher spec §3-feltnavne EKSAKT; sum/pct/flag AFLEDT (aldrig
// hardcodet); ingen phantom-default; batteri-noeglerne uroert. Koeres: node test/instrument-mycel.mjs
import {
  WHO5_INSTRUMENT, PHQ9_INSTRUMENT, INSTRUMENTER,
  instrumentFeltOrden, instrumentDerived, buildInstrumentMycel,
  GAD7_INSTRUMENT,
  SKEMA_ORDER, SKEMAER,
} from '../mentem-skema-core.js';

let fejl = 0;
function ok(cond, navn) { console.log((cond ? '  ✓ ' : '  ✗ FAIL ') + navn); if (!cond) fejl++; }
function eq(a, b, navn) { const c = JSON.stringify(a) === JSON.stringify(b); if (!c) console.log('    forventet: ' + JSON.stringify(b) + '\n    fik:       ' + JSON.stringify(a)); ok(c, navn); }

console.log('Instrument [MYCEL v1]-emitter guard (spec §3 + kontrakt §1):');

// ── Register + coeksistens (batteri uroert) ─────────────────────────────────
ok(INSTRUMENTER.who5 === WHO5_INSTRUMENT && INSTRUMENTER.phq9 === PHQ9_INSTRUMENT, 'INSTRUMENTER registrerer who5+phq9');
ok(WHO5_INSTRUMENT.kind === 'instrument' && PHQ9_INSTRUMENT.kind === 'instrument', "kind='instrument'");
ok(!SKEMA_ORDER.includes('who5') === false, 'batteri who5 STADIG i SKEMA_ORDER (coeksistens)');
ok(SKEMAER.who5 && SKEMAER.who5.kind === 'radio', 'batteri SKEMAER.who5 uroert (kind=radio)');
ok(SKEMAER.phq9 && SKEMAER.phq9.kind === 'radio', 'batteri SKEMAER.phq9 uroert (kind=radio)');
ok(SKEMAER.who5 !== WHO5_INSTRUMENT, 'instrument-who5 ER IKKE batteri-who5 (separat objekt)');

// ── WHO-5: feltorden (spec §3) + skala ──────────────────────────────────────
eq(instrumentFeltOrden(WHO5_INSTRUMENT),
  ['who5_item_1', 'who5_item_2', 'who5_item_3', 'who5_item_4', 'who5_item_5', 'who5_raw', 'who5_pct'],
  'WHO-5 feltorden = spec §3 eksakt');
eq(WHO5_INSTRUMENT.scoredItems.length, 5, 'WHO-5 5 items');
eq(WHO5_INSTRUMENT.options.length, 6, 'WHO-5 6 svarkategorier');
eq(WHO5_INSTRUMENT.options.map(o => o.value), [5, 4, 3, 2, 1, 0], 'WHO-5 vaerdier 5..0');
// Verbatim svarkategorier (spec §7.1).
eq(WHO5_INSTRUMENT.options.map(o => o.label),
  ['Hele tiden', 'Det meste af tiden', 'Lidt mere end halvdelen af tiden', 'Lidt mindre end halvdelen af tiden', 'Lidt af tiden', 'På intet tidspunkt'],
  'WHO-5 svarkategorier VERBATIM (spec §7.1)');

// ── WHO-5: ×4-afledning (who5_pct = raw*4) ──────────────────────────────────
const who5full = { who5_item_1: 5, who5_item_2: 4, who5_item_3: 3, who5_item_4: 2, who5_item_5: 1 };  // raw 15
const who5d = instrumentDerived(WHO5_INSTRUMENT, who5full);
eq(who5d.who5_raw, 15, 'WHO-5 raw = sum(items)');
eq(who5d.who5_pct, 60, 'WHO-5 pct = raw x4 (AFLEDT, ikke hardcodet)');
const who5max = instrumentDerived(WHO5_INSTRUMENT, { who5_item_1: 5, who5_item_2: 5, who5_item_3: 5, who5_item_4: 5, who5_item_5: 5 });
eq(who5max.who5_pct, 100, 'WHO-5 max raw 25 -> pct 100');
// Manglende item -> afledt = null (ingen vildledende delsum).
eq(instrumentDerived(WHO5_INSTRUMENT, { who5_item_1: 5 }).who5_raw, null, 'WHO-5 delvis -> raw null (ingen delsum)');

const who5mycel = buildInstrumentMycel(WHO5_INSTRUMENT, who5full, { ref: 'klient-7Q', dato: '2026-06-27', kilde: 'web' });
const w = who5mycel.split('\n');
eq(w[0], '[MYCEL v1]', 'WHO-5 linje 1 = [MYCEL v1]');
eq(w[1], 'skabelon: who5', 'WHO-5 skabelon: who5');
eq(w[2], 'klient_ref: klient-7Q', 'WHO-5 klient_ref fra meta');
eq(w[3], 'dato: 2026-06-27', 'WHO-5 dato fra meta (ingen today())');
eq(w[4], 'kilde: web', 'WHO-5 kilde: web');
eq(w[5], 'who5_item_1: 5', 'WHO-5 item_1');
eq(w[10], 'who5_raw: 15', 'WHO-5 raw-linje afledt');
eq(w[11], 'who5_pct: 60', 'WHO-5 pct-linje afledt');
eq(w[w.length - 1], '[/MYCEL]', 'WHO-5 footer = [/MYCEL]');
eq(w.length, 5 + 7 + 1, 'WHO-5 envelope = 5 header + 7 felter + 1 footer');

// ── PHQ-9: feltorden (spec §3) + skala ──────────────────────────────────────
eq(instrumentFeltOrden(PHQ9_INSTRUMENT),
  ['phq9_item_1', 'phq9_item_2', 'phq9_item_3', 'phq9_item_4', 'phq9_item_5', 'phq9_item_6', 'phq9_item_7', 'phq9_item_8', 'phq9_item_9', 'phq9_sum', 'phq9_item9_flag', 'phq9_funktion'],
  'PHQ-9 feltorden = spec §3 eksakt');
eq(PHQ9_INSTRUMENT.scoredItems.length, 9, 'PHQ-9 9 scorede items');
eq(PHQ9_INSTRUMENT.options.map(o => o.label), ['Slet ikke', 'Flere dage', 'Mere end halvdelen af dagene', 'Næsten hver dag'], 'PHQ-9 svarkategorier VERBATIM (spec §7.2)');
ok(PHQ9_INSTRUMENT.funktion && PHQ9_INSTRUMENT.funktion.optional === true, 'PHQ-9 funktionsspoergsmaal valgfrit');
eq(PHQ9_INSTRUMENT.funktion.options.map(o => o.label), ['Slet ikke besværligt', 'Lidt besværligt', 'Meget besværligt', 'Ekstremt besværligt'], 'PHQ-9 funktion-svar VERBATIM');
eq(PHQ9_INSTRUMENT.safetyKey, 'phq9_item_9', 'PHQ-9 safetyKey = item 9');
// Verbatim spot-check: item 9 (selvmordstanker) + en-dash i item 6/8.
ok(PHQ9_INSTRUMENT.scoredItems[8].text.startsWith('Tanker om, at det ville være bedre'), 'PHQ-9 item 9 verbatim selvmordstanke-ordlyd');
ok(PHQ9_INSTRUMENT.scoredItems[5].text.includes('–'), 'PHQ-9 item 6 baerer en-dash (verbatim)');
ok(PHQ9_INSTRUMENT.scoredItems[7].text.includes('–'), 'PHQ-9 item 8 baerer en-dash (verbatim)');

// ── PHQ-9: sum-afledning + item9-flag ───────────────────────────────────────
const phq9full = {};
for (let i = 1; i <= 9; i++) phq9full['phq9_item_' + i] = 2;   // sum 18
const phq9d = instrumentDerived(PHQ9_INSTRUMENT, phq9full);
eq(phq9d.phq9_sum, 18, 'PHQ-9 sum = sum(9 items) AFLEDT');
eq(phq9d.phq9_item9_flag, true, 'PHQ-9 item9=2>0 -> flag true');
// item 9 = 0 -> flag false; funktion taeller IKKE i sum.
const phq9z = { ...phq9full, phq9_item_9: 0, phq9_funktion: 3 };
const phq9zd = instrumentDerived(PHQ9_INSTRUMENT, phq9z);
eq(phq9zd.phq9_item9_flag, false, 'PHQ-9 item9=0 -> flag false');
eq(phq9zd.phq9_sum, 16, 'PHQ-9 funktion taeller IKKE i sum (16, ikke 19)');

const phq9mycel = buildInstrumentMycel(PHQ9_INSTRUMENT, { ...phq9full, phq9_funktion: 2 }, { ref: 'r', dato: '2026-06-27', kilde: 'web' });
const p = phq9mycel.split('\n');
eq(p[1], 'skabelon: phq9', 'PHQ-9 skabelon: phq9');
eq(p[5], 'phq9_item_1: 2', 'PHQ-9 item_1');
eq(p[13], 'phq9_item_9: 2', 'PHQ-9 item_9');
eq(p[14], 'phq9_sum: 18', 'PHQ-9 sum afledt');
eq(p[15], 'phq9_item9_flag: true', 'PHQ-9 item9_flag emitteres (behandler-flag)');
eq(p[16], 'phq9_funktion: 2', 'PHQ-9 funktion emitteres');
eq(p.length, 5 + 12 + 1, 'PHQ-9 envelope = 5 header + 12 felter + 1 footer');

// ── Invariant: ingen phantom-default. Tomt answers -> alle felter tomme, flag tom ──
const tomW = buildInstrumentMycel(WHO5_INSTRUMENT, {}, { ref: '', dato: '', kilde: 'web' });
ok(!tomW.split('\n').slice(5, -1).some(l => /:\s*\d/.test(l)), 'WHO-5 tom -> 0 gaettede tal');
const tomP = buildInstrumentMycel(PHQ9_INSTRUMENT, {}, { ref: '', dato: '', kilde: 'web' });
ok(tomP.includes('phq9_item9_flag: \n') || tomP.split('\n').find(l => l.startsWith('phq9_item9_flag:')) === 'phq9_item9_flag: ', 'PHQ-9 tom -> item9_flag tom (ikke false-gaet)');
ok(!tomP.split('\n').slice(5, -1).some(l => /:\s*(\d|true|false)/.test(l)), 'PHQ-9 tom -> 0 gaettede tal/flag');

// Heltal-validering: ikke-heltal -> tom.
const snavs = buildInstrumentMycel(WHO5_INSTRUMENT, { who5_item_1: 'abc', who5_item_2: 2.5 }, { ref: '', dato: '', kilde: 'web' });
eq(snavs.split('\n')[5], 'who5_item_1: ', 'ikke-numerisk -> tom');
eq(snavs.split('\n')[6], 'who5_item_2: ', 'ikke-heltal -> tom');

// SMS-fallback: bevidst lossy markeret.
const fb = buildInstrumentMycel(WHO5_INSTRUMENT, { who5_item_1: 4 }, { ref: 'r', dato: '2026-06-27', kilde: 'sms-fallback' });
eq(fb.split('\n')[4], 'kilde: sms-fallback', 'fallback markeret kilde: sms-fallback');

// ── GAD-7: KLAR + registreret (verbatim 2026-06-27) ─────────────────────────
ok(GAD7_INSTRUMENT.KLAR === true, 'GAD-7 KLAR (verbatim modtaget)');
ok(INSTRUMENTER.gad7 === GAD7_INSTRUMENT, 'GAD-7 i INSTRUMENTER (single-token ?s=gad7 rammer det)');
ok(GAD7_INSTRUMENT.kind === 'instrument', "GAD-7 kind='instrument'");
ok(SKEMAER.gad7 && SKEMAER.gad7.kind === 'radio', 'batteri SKEMAER.gad7 uroert (kind=radio)');
ok(SKEMAER.gad7 !== GAD7_INSTRUMENT, 'instrument-gad7 ER IKKE batteri-gad7 (separat objekt)');
ok(SKEMA_ORDER.includes('gad7'), 'batteri gad7 STADIG i SKEMA_ORDER (coeksistens)');
// Feltorden (INGEN funktion/flag, modsat PHQ-9).
eq(instrumentFeltOrden(GAD7_INSTRUMENT),
  ['gad7_item_1', 'gad7_item_2', 'gad7_item_3', 'gad7_item_4', 'gad7_item_5', 'gad7_item_6', 'gad7_item_7', 'gad7_sum'],
  'GAD-7 feltorden = 7 items + gad7_sum (ingen funktion/flag)');
eq(GAD7_INSTRUMENT.scoredItems.length, 7, 'GAD-7 7 scorede items');
eq(GAD7_INSTRUMENT.options.map(o => o.value), [0, 1, 2, 3], 'GAD-7 vaerdier 0..3');
eq(GAD7_INSTRUMENT.options.map(o => o.label),
  ['Slet ikke', 'Flere dage', 'Mere end halvdelen af dagene', 'Næsten hver dag'],
  'GAD-7 svarkategorier VERBATIM (matcher PHQ-9 Danish)');
ok(!GAD7_INSTRUMENT.funktion, 'GAD-7 INGEN funktionslinje (modsat PHQ-9)');
ok(!GAD7_INSTRUMENT.safetyKey, 'GAD-7 INGEN safetyKey/safety-panel (ingen suicidalitets-item)');
// Verbatim spot-checks (item 1 + item 7) + marker-klausul som ORD (ingen ✔-glyf).
ok(GAD7_INSTRUMENT.scoredItems[0].text === 'Følt dig nervøs, ængstelig eller anspændt', 'GAD-7 item 1 verbatim');
ok(GAD7_INSTRUMENT.scoredItems[6].text === 'Været bange, som om noget frygteligt kunne ske', 'GAD-7 item 7 verbatim');
ok(GAD7_INSTRUMENT.instruktion.includes('et kryds') && !GAD7_INSTRUMENT.instruktion.includes('✔'), 'GAD-7 marker-klausul = ord "et kryds", ingen emoji-glyf');
ok(GAD7_INSTRUMENT.attribution === 'Spitzer, Williams, Kroenke et al., med uddannelseslegat fra Pfizer Inc.', 'GAD-7 attribution verbatim');
// Sum-afledning (0-21) + envelope.
const gad7full = {};
for (let i = 1; i <= 7; i++) gad7full['gad7_item_' + i] = 2;   // sum 14
const gad7d = instrumentDerived(GAD7_INSTRUMENT, gad7full);
eq(gad7d.gad7_sum, 14, 'GAD-7 sum = sum(7 items) AFLEDT');
eq(instrumentDerived(GAD7_INSTRUMENT, { gad7_item_1: 2 }).gad7_sum, null, 'GAD-7 delvis -> sum null (ingen delsum)');
const gad7max = instrumentDerived(GAD7_INSTRUMENT, Object.fromEntries(Array.from({ length: 7 }, (_, i) => ['gad7_item_' + (i + 1), 3])));
eq(gad7max.gad7_sum, 21, 'GAD-7 max sum = 21');
const gad7mycel = buildInstrumentMycel(GAD7_INSTRUMENT, gad7full, { ref: 'klient-9Z', dato: '2026-06-27', kilde: 'web' });
const g = gad7mycel.split('\n');
eq(g[1], 'skabelon: gad7', 'GAD-7 skabelon: gad7');
eq(g[5], 'gad7_item_1: 2', 'GAD-7 item_1');
eq(g[11], 'gad7_item_7: 2', 'GAD-7 item_7');
eq(g[12], 'gad7_sum: 14', 'GAD-7 sum afledt');
eq(g[g.length - 1], '[/MYCEL]', 'GAD-7 footer = [/MYCEL]');
eq(g.length, 5 + 8 + 1, 'GAD-7 envelope = 5 header + 8 felter + 1 footer');
// Invariant: tomt -> 0 gaettede tal.
const tomG = buildInstrumentMycel(GAD7_INSTRUMENT, {}, { ref: '', dato: '', kilde: 'web' });
ok(!tomG.split('\n').slice(5, -1).some(l => /:\s*\d/.test(l)), 'GAD-7 tom -> 0 gaettede tal');

console.log(fejl === 0 ? '\nINSTRUMENT MYCEL-GUARD PASSED ✅' : '\nINSTRUMENT MYCEL-GUARD FAILED ❌ (' + fejl + ')');
process.exit(fejl === 0 ? 0 : 1);
