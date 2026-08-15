// afsender-stempel-kontrakt.mjs — Viktor-ordre 26/7 punkt 2: "versionsnummer i links,
// registreret ved retur".
//
// HULLET DER LUKKES (målt 26/7): `version`/`schemaVersion` står som hårdkodede 1-taller i
// ALLE payloadbyggere og har aldrig ændret sig. Da MN's oplysningsskema blev afvist kl.
// 09:34:13, kunne udgaven han faktisk udfyldte KUN udledes ved at læse serverlog og
// kildekode side om side. Med et afsender-stempel havde svaret stået i data.
//
// KONTRAKTEN (og hele pointen): stemplet OPDIGTER ALDRIG. Er herkomsten ukendt, står der
// null — ikke en default der ligner en måling. Det er samme fejlklasse som `?? 1`.
//
// Kør: node test/afsender-stempel-kontrakt.mjs   (exit 0 = alle grønne)

import {
  setAfsenderKontekst,
  afsenderStempel,
  buildPayload,
  buildPayloadCSD,
  buildPayloadBaseline,
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

const SHA = 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678';   // 40 hex, som deploy-sha.txt
// Nøglerne er MÅLT i SOEVN_SCREENING (mentem-skema-core.js:582-614), ikke gættet:
// mit første udkast opdigtede `bipolar`/`epilepsi` og blev afvist af byggeren selv.
// 🔴 `alder` tilfoejet 15/8. Fiksturet er fra 26/7; screeningen fik `alder` som PAAKRAEVET
// felt 12/8 (talfeltet der afloeste ja/nej-itemet `alderOver50`), og fiksturet fulgte ikke
// med. Proeven har derfor kastet `paakraevet_mangler:alder` siden 12/8 uden at nogen saa
// det, fordi ingen automatik koerer den. Fundet 15/8 ved en folketaelling over alle 39
// harnesser, ikke ved at nogen kiggede paa denne fil.
// 🔵 `alderOver50` bliver staaende: det er den AFLEDTE STOP-Bang-vaerdi, ikke raatallet,
// og proevens emne er afsender-stemplet , ikke screeningens egen validering. Fiksturet
// skal derfor bare vaere GYLDIGT, ikke minimalt.
const SVAR_SCREENING = {
  alder: 58,
  snorken: true, observeretApnoe: false, dagtraethed: true, hypertension: false,
  bmiOver35: false, alderOver50: true, halsomfangOver40: null, koen: 'kvinde',
  bipolarMani: false, epilepsiAnfald: false, parasomnier: true,
  betydeligFaldrisiko: false, erhvervschauffoer: false, natarbejde: false,
};

console.log('afsender-stempel (Viktor-ordre 26/7 punkt 2):');

// ── §1 UDGANGSPUNKT: intet sat ⇒ intet påstået ─────────────────────────────
setAfsenderKontekst(null);
eq('§1 usat kontekst giver rene null-felter', afsenderStempel(),
   { webDeploySha: null, linkVersion: null });

// ── §2 Stemplet bærer det der ER målt ──────────────────────────────────────
setAfsenderKontekst({ webDeploySha: SHA, linkVersion: 2 });
eq('§2 sat kontekst bæres uændret', afsenderStempel(),
   { webDeploySha: SHA, linkVersion: 2 });

// ── §3 FAIL-CLOSED PÅ SKRAMMEL. En forkert SHA er værre end ingen SHA: den ser
//    autoritativ ud i en obduktion. Samme for en linkVersion der ikke er et tal. ──
setAfsenderKontekst({ webDeploySha: '<!DOCTYPE html>', linkVersion: 1 });
eq('§3a HTML-svar (404-side) fra deploy-sha.txt afvises', afsenderStempel().webDeploySha, null);
check('§3a  — men linkVersion overlever afvisningen', afsenderStempel().linkVersion === 1);

setAfsenderKontekst({ webDeploySha: SHA.slice(0, 12), linkVersion: 1 });
eq('§3b afkortet SHA afvises (kun præcis 40 hex)', afsenderStempel().webDeploySha, null);

setAfsenderKontekst({ webDeploySha: `  ${SHA.toUpperCase()}\n`, linkVersion: '3' });
eq('§3c whitespace/versaler normaliseres frem for at afvises', afsenderStempel().webDeploySha, SHA);
eq('§3d ciffer-streng fra URL bliver til tal', afsenderStempel().linkVersion, 3);

setAfsenderKontekst({ webDeploySha: SHA, linkVersion: 'nyeste' });
eq('§3e ikke-numerisk linkVersion afvises', afsenderStempel().linkVersion, null);

setAfsenderKontekst({ webDeploySha: SHA, linkVersion: 0 });
eq('§3f linkVersion 0 afvises (versioner tælles fra 1)', afsenderStempel().linkVersion, null);

// ── §4 ALLE FIRE BYGGERE STEMPLER. Det var netop ujævnheden mellem byggerne
//    (konvolut vs flad) der lukkede fil-vejen for oplysningsskemaet 26/7. ──
setAfsenderKontekst({ webDeploySha: SHA, linkVersion: 2 });
const FORVENTET = { webDeploySha: SHA, linkVersion: 2 };

// 🔴 MÅLT, IKKE ANTAGET: tre af byggerne wrapper i en konvolut, baseline leverer FLADT.
// Netop den asymmetri lukkede fil-vejen for oplysningsskemaet 26/7 (genkenderen kiggede
// kun på yderste lag). Derfor står den her ordret frem for at blive gemt i en hjælper —
// en fremtidig ensretning SKAL vælte denne prøve og ikke glide igennem.
const batteri = buildPayload({ gad7: { g1: 1, g2: 1, g3: 1, g4: 1, g5: 1, g6: 1, g7: 1 } }, {});
eq('§4a buildPayload (batteri) — konvolut-form ⇒ data.afsender', batteri.data.afsender, FORVENTET);

const csd = buildPayloadCSD([{ date: '2026-07-20', bedtime: '23:00', risetime: '07:00' }], {});
eq('§4b buildPayloadCSD (søvndagbog) — konvolut-form ⇒ data.afsender', csd.data.afsender, FORVENTET);

const baseline = buildPayloadBaseline({}, {});
eq('§4c buildPayloadBaseline — FLAD form ⇒ afsender på toppen', baseline.afsender, FORVENTET);
check('§4c  — og baseline er stadig flad (ingen konvolut-wrap sneget ind)',
      baseline.data === undefined && baseline.schemaType === undefined);

const screening = buildPayloadScreening(SVAR_SCREENING, {});
eq('§4d buildPayloadScreening — stemplet ligger i data, ikke på konvolutten',
   screening.data.afsender, FORVENTET);
check('§4d  — og konvolut-toppen er urørt (Swift-decoderen ville tabe et top-felt)',
      screening.afsender === undefined);

// ── §5 Stemplet må ALDRIG fortrænge klinisk indhold ────────────────────────
check('§5 screeningSvar er intakt ved siden af stemplet',
      screening.data.screeningSvar && screening.data.screeningSvar.stopBang.snorken === true);
eq('§5  — og schemaType er uændret', screening.schemaType, 'soevn-screening');

console.log(failures === 0 ? '\n🟢 alle grønne' : `\n🔴 ${failures} fejlede`);
process.exit(failures === 0 ? 0 : 1);
