// Licens-profil-gate (Viktor-beslutning 18/7 + 19/7) — RATCHET for sublicens-porten.
//
// BESLUTNINGEN, i to led der IKKE må blandes sammen:
//   1. »Kunderne står selv for licensaftaler. Kun instrumenter der er frie til kommerciel
//      videredistribution leveres automatisk med Mycel Journal.« (Viktor 18/7)
//      Porten er `Kommercielt = JA` verificeret mod primærkilde — IKKE pris. WHO-5 er gratis
//      OG spærret (CC BY-NC-SA 3.0): bygges porten på pris, ryger den med ved første kunde.
//   2. »Det interne produkt må ikke komme i vejen.« (Viktor 19/7) Viktors egen praksis skal
//      blive ved at virke og blive opdateret, så der altid kan vises en demo der FAKTISK
//      virker. Licens-arbejde må aldrig gøre hans eget værktøj fattigere.
//
// ⇒ FAIL-CLOSED GÆLDER PRODUKT-PROFILEN, IKKE INSTALLATIONEN.
//   Uverificeret betyder »følger ikke med i et salg«, ikke »forsvinder fra Viktors app«.
//   Ellers bliver det dyrt at registrere tvivl, og så registrerer ingen tvivl.
//
// HVORFOR PROFILER FREM FOR SLETNING: Viktor HAR en gyldig ESS-licens til intern klinisk brug
// (Mapi Special Terms 140135), og den følger ikke med produktet (General Terms §3.1:
// »non-transferable, non-assignable, non-sublicensable«). Samme flade skal derfor kunne vise
// ESS hos ham og skjule det hos en kunde. Det er aftaletekst, ikke et skøn.
//
// NB om ordet »intern«: det betyder »drevet af Viktors egen praksis«, ikke »ikke på internettet«.
// NC-klausuler rammer kommerciel udnyttelse, ikke offentlig tilgængelighed. Hans klienter må
// tilgå WHO-5 på et offentligt link; en KUNDE der har købt journalen må ikke.
//
// Køres: node test/licens-profil-gate.mjs
import {
  OFFENTLIGT_KLAR, SKEMAER,
  INSTRUMENT_LICENS, PROFIL_INTERN, PROFIL_PRODUKT, allowlistFor,
  INSTRUMENT_MODULER,
} from '../mentem-skema-core.js';

let fejl = 0;
function ok(cond, navn) { console.log((cond ? '  ✓ ' : '  ✗ FAIL ') + navn); if (!cond) fejl++; }

console.log('Licens-profil-gate (intern urørt · produkt fail-closed):');

// ── 1. Den INTERNE profil er urørt — Viktors app må ikke ændre sig ──────────
// Dette er beslutningens led 2, som en assert. Falder den, har licens-arbejdet
// taget noget fra det interne produkt, og det er præcis det der ikke må ske.
{
  const intern = allowlistFor(PROFIL_INTERN);
  ok(intern.join(',') === OFFENTLIGT_KLAR.join(','),
    'INTERN profil === OFFENTLIGT_KLAR uændret (Viktors flade rører sig ikke)');
  ok(intern.join(',') === 'gad7,phq9,who5,wsas',
    'INTERN profil er fortsat gad7,phq9,who5,wsas — WHO-5 og WSAS BLIVER i hans praksis');
  ok(allowlistFor() .join(',') === intern.join(','),
    'default-profil er INTERN (en glemt parameter må ikke amputere hans app)');
}

// ── 2. PRODUKT-profilen er fail-closed ─────────────────────────────────────
{
  const produkt = allowlistFor(PROFIL_PRODUKT);
  ok(produkt.join(',') === 'gad7,phq9',
    'PRODUKT profil === gad7,phq9 (de eneste med Kommercielt=JA, verificeret 18/7)');
  ok(!produkt.includes('who5'),
    'WHO-5 er UDE af produktet (gratis, men CC BY-NC-SA 3.0 — NC forbyder salg)');
  ok(!produkt.includes('wsas'),
    'WSAS er UDE af produktet (kræver tilladelse; kommerciel status uafklaret v. kilden)');
  // Produkt-profilen må aldrig være bredere end den interne: man kan ikke sælge
  // adgang til noget installationen ikke selv har.
  ok(produkt.every(id => OFFENTLIGT_KLAR.includes(id)),
    'PRODUKT er en delmængde af INTERN (kan ikke sælge hvad installationen ikke har)');
  ok(produkt.length > 0, 'PRODUKT er ikke tom (porten spærrer ikke ALT — så ville produktet være dødt)');
}

// ── 3. Fail-closed er STRUKTUREL, ikke en liste der skal vedligeholdes ─────
// Et nyt instrument uden licens-registrering må ALDRIG kunne glide ind i produktet.
// Det er hele forskellen på en gate og en huskeseddel.
{
  const uregistreret = OFFENTLIGT_KLAR.filter(id => !(id in INSTRUMENT_LICENS));
  ok(uregistreret.length === 0,
    `alle interne instrumenter er licens-registrerede (uregistrerede: ${uregistreret.join(',') || 'ingen'})`);

  for (const id of allowlistFor(PROFIL_PRODUKT)) {
    ok(INSTRUMENT_LICENS[id] && INSTRUMENT_LICENS[id].kommercielt === true,
      `'${id}' i produktet har kommercielt===true (ikke 'truthy', ikke null)`);
    ok(typeof INSTRUMENT_LICENS[id].verificeret === 'string' && INSTRUMENT_LICENS[id].verificeret.length > 0,
      `'${id}' bærer en verifikations-dato (påstand uden dato er ikke verifikation)`);
    ok(typeof INSTRUMENT_LICENS[id].kilde === 'string' && INSTRUMENT_LICENS[id].kilde.length > 0,
      `'${id}' bærer en primærkilde`);
  }

  // null (= uverificeret) skal behandles som spærret, ikke som ukendt/tilladt.
  const uverificerede = Object.keys(INSTRUMENT_LICENS).filter(id => INSTRUMENT_LICENS[id].kommercielt !== true);
  for (const id of uverificerede) {
    ok(!allowlistFor(PROFIL_PRODUKT).includes(id),
      `'${id}' (kommercielt=${JSON.stringify(INSTRUMENT_LICENS[id].kommercielt)}) er spærret i produktet`);
  }
}

// ── 4. Registret må ikke drive fra de skemaer der faktisk findes ───────────
{
  // 🔴 PRÆMISSEN VAR FOR SNÆVER: den antog at et licensregister kun kan beskrive
  // BATTERI-skemaer. ESS er et instrument-MODUL (INSTRUMENT_MODULER), ikke et batteri-skema,
  // og dens licensrække hører lige så meget hjemme her: det er dén række der får §3l-gaten
  // til at gå rød med begge betingelser navngivet, den dag nogen sætter ess klientvendt.
  // ⇒ Driften gaten vogter mod, er »en licensrække uden et instrument«. Den er bevaret;
  // populationen af kendte instrumenter er bare målt rigtigt.
  const kendteInstrumenter = new Set([...Object.keys(SKEMAER), ...INSTRUMENT_MODULER.map(m => m.skabelon)]);
  for (const id of Object.keys(INSTRUMENT_LICENS)) {
    ok(kendteInstrumenter.has(id),
       `licens-registret kender kun ægte instrumenter ('${id}' findes i SKEMAER eller INSTRUMENT_MODULER)`);
  }
}

// ── 5. RED-bevis: gaten SKAL slippe et spærret instrument ind hvis den slås fra ──
// Uden dette led er §2 kun en påstand om at filtreringen sker. Vi kalder gaten med et
// syntetisk register hvor WHO-5 er markeret kommercielt, og kræver at den så lukker den ind.
// Gør den ikke det, filtrerer allowlistFor ikke på licens-feltet, og §2's grønne er falske.
{
  const muteret = { ...INSTRUMENT_LICENS, who5: { ...INSTRUMENT_LICENS.who5, kommercielt: true } };
  let slapIgennem = false;
  try {
    slapIgennem = allowlistFor(PROFIL_PRODUKT, muteret).includes('who5');
  } catch { /* kunne ikke injiceres → ikke bevist */ }
  ok(slapIgennem,
    'RED-bevis: med who5 markeret kommercielt SLIPPER den ind i produktet → gaten læser faktisk licens-feltet');

  // Og modsat: den ægte gate må ikke påvirkes af mutationen.
  ok(!allowlistFor(PROFIL_PRODUKT).includes('who5'),
    'RED-bevis, modprøve: det ÆGTE register er uændret efter mutationen (ingen delt tilstand)');
}

console.log(fejl === 0
  ? '\n✅ Licens-profil-gate: alle grønne (intern urørt, produkt fail-closed, RED-bevis holder).'
  : `\n❌ ${fejl} fejl.`);
process.exit(fejl === 0 ? 0 : 1);
