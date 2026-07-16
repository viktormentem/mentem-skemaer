// VERA-guard #3 — formulerings-fladens licens-lås (ratchet, Viktor-GO 2026-07-16).
//
// HVORFOR: licens-registrets række 1.2 (noter/licens-register-kanonisk-2026-07-16.md)
// siger at formulerings-fladen må vises for klienter, fordi den gengiver Wells' MODEL
// i vores egne ord: idé, ikke udtryk. Ophavsret beskytter udtryk, ikke idéer.
// Registrets FLIP-BETINGELSE 01 siger at den konklusion FALDER den dag verbatim
// tekst fra et licenseret instrument indsættes i fladen.
//
// Indtil nu var den betingelse uhåndhævet: 0-overlap blev målt ÉN gang i hånden 16/7,
// og intet i koden forhindrede nogen i at bryde den bagefter. Denne guard gør målingen
// permanent. Den er fladens modstykke til test/batteri-klar-gate.mjs (som låser at
// licens-pending instrumenter ikke kan RENDRES) — her låses at deres TEKST ikke kan
// vandre ind i en flade der ikke er gatet af OFFENTLIGT_KLAR.
//
// AFLEDT, ALDRIG HARDCODET (T9): korpuset er SKEMA_ORDER \ OFFENTLIGT_KLAR. Tages et
// instrument af det offentlige batteri (= licens-pending), begynder guarden AUTOMATISK
// at beskytte mod dets tekst. Godkendes WAI-SR og ryger ind i OFFENTLIGT_KLAR, falder
// den lige så automatisk ud. Ingen liste her kan gå stale.
//
// HVAD DEN IKKE KAN: den ser verbatim genbrug, ikke parafrase. Registrets flip-
// betingelse 02 (Appendix 11-formularen) og 03 (Fig 6.1-6.3-layout) er formmæssige og
// forbliver et menneskeligt skøn. Det er bevidst: en guard der lod som om den dækkede
// dem, ville være farligere end ingen guard. Se rapportens §"dækningens grænse".
//
// Køres: node test/formulering-licens-gate.mjs
//        node test/formulering-licens-gate.mjs --selvtest   (RØD-bevis: planter en violation)
import {
  SKEMA_ORDER, OFFENTLIGT_KLAR, SKEMAER,
  FORMULERING_BOKS_TITLER, FORMULERING_SLOEJFER, FORMULERING_UI,
} from '../mentem-skema-core.js';

// En streng under denne længde er ikke distinkt nok til at et træf beviser genbrug
// ("Søgt beroligelse" er almindeligt klinisk dansk, ikke nogens ejendom). Men et for
// kort korpus-element må IKKE bare springes over i tavshed: det ville være fail-open,
// præcis den fælde der blev fanget i fund #3's red-team (.get(..., False) lod en
// løgnagtig fil passere som grøn). Derfor: for kort => guarden FEJLER og forlanger
// en eksplicit beslutning. Fail-closed.
const MIN_DISTINKT = 20;

export function norm(s) {
  return String(s).normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Licens-pending = alt i det kanoniske batteri-register der IKKE må vises offentligt. */
export function licensPending() {
  return SKEMA_ORDER.filter((k) => !OFFENTLIGT_KLAR.includes(k));
}

/** Klient-synlig verbatim tekst fra de licens-pending instrumenter. */
export function licensKorpus() {
  const ud = [];
  for (const noegle of licensPending()) {
    const s = SKEMAER[noegle];
    if (!s) continue;
    if (s.instruction) ud.push({ noegle, felt: 'instruction', tekst: s.instruction });
    for (const it of s.items || []) {
      if (it && it.text) ud.push({ noegle, felt: `items.${it.key}`, tekst: it.text });
    }
  }
  return ud;
}

/** Alt klient-synligt tekst formulerings-fladen selv ejer (fladens EGEN copy). */
export function formuleringTekster() {
  const ud = [];
  for (const [k, v] of Object.entries(FORMULERING_BOKS_TITLER || {})) {
    ud.push({ kilde: `FORMULERING_BOKS_TITLER.${k}`, tekst: v });
  }
  (FORMULERING_SLOEJFER || []).forEach((s, i) => {
    if (s && s.tekst) ud.push({ kilde: `FORMULERING_SLOEJFER[${i}]`, tekst: s.tekst });
    if (s && s.titel) ud.push({ kilde: `FORMULERING_SLOEJFER[${i}].titel`, tekst: s.titel });
  });
  for (const [k, v] of Object.entries(FORMULERING_UI || {})) {
    if (typeof v === 'string') ud.push({ kilde: `FORMULERING_UI.${k}`, tekst: v });
  }
  return ud;
}

/** Verbatim-genbrug: en licenseret streng der optræder ordret inde i en flade-tekst. */
export function findGenbrug(korpus, tekster) {
  const fund = [];
  for (const k of korpus) {
    const n = norm(k.tekst);
    for (const t of tekster) {
      if (norm(t.tekst).includes(n)) fund.push({ ...k, kilde: t.kilde });
    }
  }
  return fund;
}

function koer({ ekstraTekster = [], stille = false } = {}) {
  const log = (...a) => { if (!stille) console.log(...a); };
  let fejl = 0;
  const ok = (cond, navn) => { log((cond ? '  ✓ ' : '  ✗ FAIL ') + navn); if (!cond) fejl++; };

  const pending = licensPending();
  const korpus = licensKorpus();
  const tekster = [...formuleringTekster(), ...ekstraTekster];

  log('VERA-guard #3 — formulerings-fladens licens-lås:');
  log(`  i licens-pending (afledt SKEMA_ORDER \\ OFFENTLIGT_KLAR): ${pending.join(', ') || '(ingen)'}`);

  // Registret er selve præmissen: er der intet licens-pending, har guarden intet at
  // beskytte mod, og dens grønne svar ville være tomt frem for sandt.
  ok(pending.length > 0, 'der ER licens-pending instrumenter at beskytte mod');
  ok(korpus.length > 0, `korpuset er ikke tomt (${korpus.length} verbatim-strenge)`);
  ok(tekster.length > 0, `fladen har klient-synlig copy at tjekke (${tekster.length} strenge)`);

  // Fail-closed: et korpus-element vi ikke kan matche forsvarligt skal SIGES, ikke skjules.
  const forKorte = korpus.filter((k) => norm(k.tekst).length < MIN_DISTINKT);
  ok(forKorte.length === 0,
    `alle korpus-strenge er distinkte nok til at matche (>= ${MIN_DISTINKT} tegn)`);
  for (const k of forKorte) {
    log(`      ↳ ${k.noegle}.${k.felt} er kun ${norm(k.tekst).length} tegn: ${JSON.stringify(k.tekst)}`);
    log('        For kort til at et træf beviser genbrug. Træf en eksplicit beslutning:');
    log('        udelad feltet fra korpuset med begrundelse, eller hæv MIN_DISTINKT.');
  }

  const genbrug = findGenbrug(korpus, tekster);
  ok(genbrug.length === 0, 'INGEN verbatim licens-tekst i formulerings-fladens copy');
  for (const g of genbrug) {
    log(`      ↳ ${g.kilde} genbruger ${g.noegle}.${g.felt} ORDRET:`);
    log(`        ${JSON.stringify(g.tekst.slice(0, 90))}`);
  }

  if (!stille) {
    if (fejl === 0) {
      console.log(`\nformulering-licens-gate ✓ - 0 verbatim genbrug (${korpus.length} licens-strenge x ${tekster.length} flade-strenge)`);
    } else {
      console.log('\nformulering-licens-gate ✗ - LICENS-REGISTRETS FLIP-BETINGELSE 01 ER BRUDT.');
      console.log('Formulerings-fladen må da IKKE vises digitalt (behandl som CAS-1/MCB: kun papir),');
      console.log('før teksten er fjernet. Se noter/licens-register-kanonisk-2026-07-16.md § flip.');
    }
  }
  return { fejl, korpus, tekster, genbrug };
}

// ── RØD-BEVIS ───────────────────────────────────────────────────────────────
// En guard der aldrig er set fejle er en påstand, ikke et værn. --selvtest planter
// et ægte licenseret item i fladens copy og kræver at guarden fanger det.
function selvtest() {
  console.log('RØD-bevis (--selvtest): planter verbatim licens-tekst i fladens copy\n');
  const korpus = licensKorpus();
  if (korpus.length === 0) { console.log('✗ intet korpus at plante fra'); process.exit(1); }

  const offer = korpus[0];
  let fejlet = 0;

  // 1) ordret indsat som hel flade-streng
  const a = koer({ ekstraTekster: [{ kilde: 'PLANTET.helt', tekst: offer.tekst }], stille: true });
  console.log(`  ${a.fejl > 0 ? '✓' : '✗ FAIL'} fanger et ORDRET indsat item (${offer.noegle}.${offer.felt})`);
  if (a.fejl === 0) fejlet++;

  // 2) indlejret i en længere sætning (den realistiske paste)
  const b = koer({ ekstraTekster: [{ kilde: 'PLANTET.indlejret', tekst: `Prøv at lægge mærke til: ${offer.tekst} Det er værd at tale om.` }], stille: true });
  console.log(`  ${b.fejl > 0 ? '✓' : '✗ FAIL'} fanger et item INDLEJRET i en sætning`);
  if (b.fejl === 0) fejlet++;

  // 3) må IKKE fyre på parafrase (ellers er guarden ubrugelig i praksis)
  const parafrase = 'hvis jeg bekymrer mig nok, er jeg forberedt og undgår problemer';
  const c = koer({ ekstraTekster: [{ kilde: 'PLANTET.parafrase', tekst: parafrase }], stille: true });
  console.log(`  ${c.fejl === 0 ? '✓' : '✗ FAIL'} fyrer IKKE på parafrase (samme idé, egne ord = lovligt)`);
  if (c.fejl !== 0) fejlet++;

  // 4) grøn på den urørte flade
  const d = koer({ stille: true });
  console.log(`  ${d.fejl === 0 ? '✓' : '✗ FAIL'} grøn på fladen som den faktisk er`);
  if (d.fejl !== 0) fejlet++;

  console.log(fejlet === 0 ? '\nSELVTEST PASSED ✅ (guarden er set fejle, og set lade parafrase passere)'
                           : `\nSELVTEST FAILED ✗ (${fejlet})`);
  process.exit(fejlet === 0 ? 0 : 1);
}

if (process.argv.includes('--selvtest')) selvtest();
else process.exit(koer().fejl === 0 ? 0 : 1);
