// soevn-screening-kontrakt.mjs — kontrakt-test for buildPayloadScreening (Fase C §3a).
//
// FACIT = Mentem-decoderens roundtrip-test (PsykologInvitation SoevnFaseCTests
// .testScreeningSvarPayloadRoundtrip): web-emissionen skal producere PRÆCIS den
// data.screeningSvar-form Swift-parseren (SoevnScreeningIngest.parse →
// SoevnKlientScreeningSvar) er testet mod. Kontrakt-drift = søvndagbog-ULÆSELIG-
// klassen af fejl → denne fil fryser formen web-side.
//
// Kør: node test/soevn-screening-kontrakt.mjs   (exit 0 = alle grønne)

import {
  SOEVN_SCREENING,
  SOEVN_SCREENING_SCHEMA_TYPE,
  SCREENING_KLINIKER_KEYS,
  buildPayloadScreening,
} from '../mentem-skema-core.js';

let failures = 0;
function check(name, cond, detail = '') {
  if (cond) { console.log(`  ✓ ${name}`); }
  else { console.error(`  ✗ ${name} ${detail}`); failures++; }
}
function eq(name, got, want) {
  check(name, JSON.stringify(got) === JSON.stringify(want), `(got ${JSON.stringify(got)}, want ${JSON.stringify(want)})`);
}

console.log('soevn-screening kontrakt (facit = SoevnFaseCTests.testScreeningSvarPayloadRoundtrip):');

// ── FACIT (verbatim fra Swift-testen; nøgle-rækkefølge = STOPBang-feltorden) ──
const FACIT_SCREENING_SVAR = {
  stopBang: {
    snorken: true, observeretApnoe: false, dagtraethed: true, hypertension: false,
    bmiOver35: false, alderOver50: true, halsomfangOver40: null, koenMand: false,
  },
  kontraindikationer: ['parasomnier'],
  fritekst: 'Jeg går nogle gange i søvne.',
};

// Klient-svar der SKAL producere facit (parasomnier ja, alt andet nej; STOP-Bang
// 3 ja-svar; halsomfang "ved ikke" = null).
const svar = {
  bipolarMani: false, epilepsiAnfald: false, parasomnier: true,
  betydeligFaldrisiko: false, erhvervschauffoer: false, natarbejde: false,
  snorken: true, observeretApnoe: false, dagtraethed: true, hypertension: false,
  bmiOver35: false, alderOver50: true, halsomfangOver40: null, koenMand: false,
  fritekst: 'Jeg går nogle gange i søvne.',
};

const konvolut = buildPayloadScreening(svar);

// ── 1. Konvolut-form (envelope-wrap som søvndagbogen) ─────────────────────
eq('schemaType = soevn-screening', konvolut.schemaType, SOEVN_SCREENING_SCHEMA_TYPE);
eq('schemaVersion = 1', konvolut.schemaVersion, 1);
eq('clientUA = web', konvolut.clientUA, 'web');
check('clientTimestamp ISO8601 UDEN fraktioner (CryptoKit-krav)',
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(konvolut.clientTimestamp), konvolut.clientTimestamp);
eq('data.categories', konvolut.data.categories, ['soevn-screening']);

// ── 2. data.screeningSvar == FACIT (efter JSON-round-trip, som på wiren) ──
const wire = JSON.parse(JSON.stringify(konvolut.data));
eq('data.screeningSvar == Swift-facit (byte-form efter JSON-round-trip)',
  wire.screeningSvar, FACIT_SCREENING_SVAR);
check('halsomfangOver40 OVERLEVER som null på wiren (aldrig droppet/omtolket til nej)',
  'halsomfangOver40' in wire.screeningSvar.stopBang && wire.screeningSvar.stopBang.halsomfangOver40 === null);
eq('stopBang bærer PRÆCIS de 8 kontrakt-felter',
  Object.keys(wire.screeningSvar.stopBang).sort(),
  ['alderOver50', 'bmiOver35', 'dagtraethed', 'halsomfangOver40', 'hypertension', 'koenMand', 'observeretApnoe', 'snorken']);

// Score-paritet (spejler XCTAssertEqual(svar.stopBang.score, 3)): kun besvarede
// ja-svar tæller; null tæller hverken ja eller nej.
const sb = wire.screeningSvar.stopBang;
const score = Object.values(sb).filter((v) => v === true).length;
eq('STOP-Bang ja-svar på wiren = 3 (Swift-scoren decoder til 3 ≥ cutoff)', score, 3);

// ── 3. Fail-loud (ubesvaret må ALDRIG blive et tavst nej) ─────────────────
function kaster(f) { try { f(); return null; } catch (e) { return e; } }
const utenSnorken = { ...svar }; delete utenSnorken.snorken;
check('ubesvaret STOP-Bang-item kaster (paakraevet_mangler)',
  kaster(() => buildPayloadScreening(utenSnorken))?.code === 'paakraevet_mangler');
const utenKontra = { ...svar }; delete utenKontra.parasomnier;
check('ubesvaret anamnese-item kaster (paakraevet_mangler)',
  kaster(() => buildPayloadScreening(utenKontra))?.code === 'paakraevet_mangler');
const nullKontra = { ...svar, epilepsiAnfald: null };
check('null på et IKKE-vedIkke-item kaster (kun halsomfang må være null)',
  kaster(() => buildPayloadScreening(nullKontra))?.code === 'paakraevet_mangler');

// ── 4. Suicidalitet er kliniker-side (Viktor 2/7) — ALDRIG i klient-payload ──
check('aktuelSuicidalitet findes IKKE som klient-item',
  !SOEVN_SCREENING.kontraItems.some((it) => it.key === 'aktuelSuicidalitet')
  && !SOEVN_SCREENING.stopBangItems.some((it) => it.key === 'aktuelSuicidalitet'));
check('smuglet aktuelSuicidalitet-key kaster (klinikerItemForbudt)',
  kaster(() => buildPayloadScreening({ ...svar, aktuelSuicidalitet: true }))?.code === 'klinikerItemForbudt');
eq('SCREENING_KLINIKER_KEYS dækker suicidalitets-itemet', SCREENING_KLINIKER_KEYS, ['aktuelSuicidalitet']);

// ── 5. Fritekst-hygiejne ──────────────────────────────────────────────────
const udenTekst = buildPayloadScreening({ ...svar, fritekst: '   ' });
check('tom/whitespace-fritekst UDELADES af payloaden (decodeIfPresent-venlig)',
  !('fritekst' in JSON.parse(JSON.stringify(udenTekst.data)).screeningSvar));
const trimmet = buildPayloadScreening({ ...svar, fritekst: '  hej  ' });
eq('fritekst trimmes', trimmet.data.screeningSvar.fritekst, 'hej');

// ── 6. Item-keys = wire-kontrakten (Swift-enum-rawValues / STOPBang-felter) ──
eq('kontraItems-keys = SoevnKontraindikation-rawValues (klient-delen, UDEN suicidalitet)',
  SOEVN_SCREENING.kontraItems.map((it) => it.key),
  ['bipolarMani', 'epilepsiAnfald', 'parasomnier', 'betydeligFaldrisiko', 'erhvervschauffoer', 'natarbejde']);
eq('stopBangItems-keys = STOPBang-feltnavne (rækkefølge = Swift-structen)',
  SOEVN_SCREENING.stopBangItems.map((it) => it.key),
  ['snorken', 'observeretApnoe', 'dagtraethed', 'hypertension', 'bmiOver35', 'alderOver50', 'halsomfangOver40', 'koenMand']);
check('kun halsomfang har vedIkke-mulighed',
  SOEVN_SCREENING.stopBangItems.filter((it) => it.vedIkke).map((it) => it.key).join(',') === 'halsomfangOver40');

console.log('');
if (failures > 0) { console.error(`SOEVN-SCREENING-KONTRAKT FAILED: ${failures} fejl`); process.exit(1); }
console.log('SOEVN-SCREENING-KONTRAKT PASSED ✅');
