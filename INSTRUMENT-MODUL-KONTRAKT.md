# Instrument-modul-kontrakt (extensibilitets-kernen)

Hvordan et nyt klinisk instrument (effektmål) tilføjes til `mentem-skemaer` ensartet,
licens-rent og uden genbygning. Født af spec-instrument-kerne-genbygning-2026-06-27.

## Kerneidé

Hvert instrument er et **selv-indeholdt modul-objekt** i `mentem-skema-core.js`. Det lever i
et SEPARAT register (`INSTRUMENTER`), adskilt fra batteri-skemaerne (`SKEMAER`/`SKEMA_ORDER`).
Et single-token `?s=<skabelon>` rammer instrument-flowet (`renderInstrument`); et multi-token
`?s=a,b,c` går uændret til batteri-flowet.

Den generiske render-motor (`renderInstrument` + `applyStepper`/`showStep` + review + kvittering
+ a11y) er fælles for ALLE instrumenter. Du tilføjer kun DATA, aldrig render-kode.

## Modul-skema

```js
export const FOO_INSTRUMENT = {
  id: 'foo', kind: 'instrument', skabelon: 'foo',   // skabelon = ?s-token + [MYCEL]-skabelon
  uiTitle: 'Neutral klient-titel',                  // fx "Din trivsel", ALDRIG "WHO-5"
  kort: 'FOO',                                       // kort instrument-navn (attribution/del-titel)
  instruktion: '<verbatim>',                         // sentinel-omkranset (se nedenfor)
  stem: '<verbatim stamme>',                         // echoes pr. spørgsmål i stepperen
  attribution: '<verbatim kildeangivelse>',
  options: [ { value: 0, label: '<verbatim>' }, ... ],
  scoredItems: [ { key: 'foo_item_1', text: '<verbatim>' }, ... ],
  // Per-instrument flags (top-niveau, læst af renderInstrument):
  showValueBadge: false,            // synligt tal-badge på svarknap, se reglen nedenfor
  safetyKey: 'foo_item_9',          // valgfri: item > 0 → prominent safety-panel (112/Livslinien)
  funktion: { key, optional, text, options },  // valgfri funktionslinje (tæller IKKE i sum)
  // Licens-/parathedsflag (HÅRD, spec §4):
  licensStatus: 'public-domain' | 'fri-m-kildeangivelse' | 'licens-gated' | 'afventer',
  KLAR: true | false,
  // Den ANDEN akse (se "Det tredje rum" nedenfor). Udelades normalt.
  klientGodkendt: false,                        // KUN eksplicit false spærrer
  godkendelse: { krav, status, naeste, ref },    // påkrævet når klientGodkendt: false
  notitsPaaHverSide: true,                      // kildeangivelsen vises på HVERT trin, ikke kun trin 1
};
```

**`showValueBadge`-reglen er rettet 17/8** (den stod som »kun hvis højere tal = bedre«, hvilket
var et særtilfælde forklædt som reglen). Den bærende regel: **bærer den verbatim instruktion
selv tallet, skal tallet vises.** WHO-5 gør det ved at sige »et højere tal står for bedre
trivsel«; ESS gør det ved at sige »vælg det bedst passende nummer«. At skjule tallet i ESS ville
være en *ændring* af instrumentet, og ændring er præcis det licensen forbyder. PHQ-9 og GAD-7
nævner ikke tal i ordlyden, så de har ingen badge: samme regel, modsat udfald.

Afledt scoring (sum/pct/flag) defineres i `instrumentFeltOrden()` + `instrumentDerived()` pr.
`skabelon` — ALTID beregnet, ALDRIG hardcodet. Manglende item → afledt = null (ingen vildledende
delsum). `buildInstrumentMycel()` emitterer `[MYCEL v1]`-konvolutten (MJ-ejet kontrakt).

## KLAR-reglen (den maskinelle licens-gate)

`INSTRUMENTER` bygges af en GATED løkke over `INSTRUMENT_MODULER`:

```js
export const INSTRUMENT_MODULER = [ WHO5_INSTRUMENT, ..., CAS1_INSTRUMENT_SLOT, ... ];
export const INSTRUMENTER = {};
for (const m of INSTRUMENT_MODULER) if (m.KLAR) INSTRUMENTER[m.skabelon] = m;
```

- `KLAR:true`  → registreres i `INSTRUMENTER` → `?s=<skabelon>` rammer det → synligt i preview/prod.
- `KLAR:false` → defineret (struktur + flags + `licensStatus`) men **IKKE registreret** → token
  rammer det ikke → uekssponerbar. `scoredItems: []` (0 item-tekst) indtil verbatim + licens lander.
  **ALDRIG gættede/fabrikerede items i et klinisk skema.**

Guarden `test/instrument-klar-gate.mjs` asserterer maskinelt at intet `KLAR:false`-modul er nået
ind i `INSTRUMENTER`/routing — et licens-pending instrument kan derfor aldrig lække til prod.

## Det tredje rum: bygget, ikke godkendt (17/8, født af ESS)

Den binære KLAR-gate kunne ikke bære ESS, og hullet er lærerigt nok til at stå her.
Mapi Special Terms 140135 §4.3+§5 kræver at **screenshots af alle sider hvor ESS optræder
godkendes før visning**. Rækkefølgen er derfor omvendt af intuitionen: **siderne skal findes
før godkendelsen kan søges.** `KLAR:false` ville betyde »ingen skærme at fotografere«, og
`KLAR:true` alene ville betyde »nåbar for et klient-token«. Der mangler en akse:

| felt | spørgsmål | ESS i dag |
|---|---|---|
| `KLAR` | er modulet fuldt formet (verbatim tekst, skala, items)? | ja |
| `klientGodkendt` | må en KLIENT se det? | nej |

```js
export function maaVisesForKlient(m) { return m.KLAR === true && m.klientGodkendt !== false; }
INSTRUMENTER         = moduler hvor maaVisesForKlient(m)              // ?s=<skabelon> slår op HER
INSTRUMENTER_REVIEW  = moduler hvor m.KLAR && m.klientGodkendt===false // screenshot-vejen
```

**Review-døren har tre låse, alle i `index.html`s `instrumentReviewId`:** opslaget går i
`INSTRUMENTER_REVIEW`, `?godkendelsesreview=1` skal stå eksplicit, og der må **ikke** være et
ingest-token (et token er beviset på at linket er sendt til et menneske). Begge registre
renderes af **samme** `renderInstrument`. Godkendes en skærm tegnet af en anden funktion,
beviser godkendelsen noget om et artefakt der aldrig udrulles.

🔴 **`klientGodkendt` spærrer kun når den står eksplicit `false`.** Et modul der ikke kender
feltet opfører sig som før. Fail-closed hører til produkt-profilen, ikke til installationen:
et manglende felt må aldrig kunne amputere Viktors egen flade tavst.

🔴 **To ting der kun blev fundet ved at SE på et screenshot, ikke ved en rød prøve:**
1. Stepperen aktiveredes kun på `instrumentId`, så review-visningen viste **8 af 8 spørgsmål
   på ét rul**. Skærmen fungerede; den var bare ikke den skærm klienten ser.
2. Kildeangivelsen stod kun på trin 1 (`attr.hidden = i !== 0`), altså **7 sider hvor
   instrumentet optrådte uden sin lovpligtige notits**. Kuren er `notitsPaaHverSide`.

Prøven `test/e2e-ess-godkendelsesreview.mjs` måler begge arme (skærmene findes og er verbatim ·
en klient kan ikke nå dem), måler notitsen på **synlighed** og ikke på `textContent`, og
**producerer** med `SHOT_DIR=<mappe>` de screenshots der skal indsendes. Samme kørsel der
beviser, leverer.

## Sådan tager du et nyt instrument i brug (når licens + verbatim lander)

1. Find scaffold-slottet (fx `CAS1_INSTRUMENT_SLOT`) ELLER tilføj et nyt modul-objekt.
2. Indsæt verbatim `instruktion`/`stem`/`scoredItems`/`options` mellem
   `// emdash-guard:instrument-start` og `// emdash-guard:instrument-end` (verbatim er undtaget
   æøå-/em-dash-reglen; vores EGEN UI-copy i index.html forbliver em-dash-fri).
3. Tilføj evt. afledningsregel i `instrumentFeltOrden()` + `instrumentDerived()` (sum/pct/flag).
4. Sæt `licensStatus` korrekt + flip `KLAR: true`.
5. **Skal instrumentet være KLIENTVENDT (altså i `OFFENTLIGT_KLAR` ELLER i `INSTRUMENTER`):
   giv det en §3l-form i
   `INSTRUMENT_LICENS` FØRST.** `grundlag: 'A'` (dokumenteret gratis/public domain/open source,
   med `kilde` + ISO-dateret `verificeret`) eller `grundlag: 'B'` (`betingelser: [{krav,
   status}]`, hvor HVER status skal være `opfyldt`). Uden form blokerer
   `test/licens-3l-gate.mjs` push til main. Viktor-beslutning §3l (17/8): et instrument uden
   dokumenteret grundlag hører ikke på en klientvendt flade.
   🔴 Gatens nål er `OFFENTLIGT_KLAR ∪ INSTRUMENTER` (udvidet 17/8). Den målte før kun det
   første register, altså kun batteri-døren, og et single-token-instrument kunne stå live
   uden at gaten så det. Målt før udvidelsen: samme fire id'er, altså nul ny spærring.
6. Kør `node test/instrument-mycel.mjs` + `node test/instrument-klar-gate.mjs` +
   `node test/licens-3l-gate.mjs` + `node test/licens-profil-gate.mjs`
   (+ selftest + emoji/emdash + copy-guard). Nul genbygning af render-motoren.

## Aktiv nu (KLAR:true)

| skabelon | instrument | licensStatus | verbatim |
|---|---|---|---|
| `who5` | WHO-5 | fri-m-kildeangivelse (WHO 1998) | verificeret |
| `phq9` | PHQ-9 | public-domain (Pfizer 2010) | verificeret |
| `gad7` | GAD-7 | public-domain (Pfizer 2010) | verificeret |

## Bygget, ikke godkendt (KLAR:true + klientGodkendt:false)

| skabelon | instrument | licensStatus | venter på |
|---|---|---|---|
| `ess` | ESS (Epworth) | licens-gated (Mapi Special Terms 140135) | screenshot-review hos MRT + dansk e-version afklaret med ICON LS. Begge står som form B-betingelser i `INSTRUMENT_LICENS.ess`; begge `ikke opfyldt`. |

Sådan lukkes den: når MRT har godkendt, sæt begge `betingelser[].status` til `opfyldt`, fjern
`klientGodkendt`/`godkendelse` fra modulet, og kør `licens-3l-gate` + `instrument-klar-gate`.
Gør man kun det ene, fælder den anden gate push'et, med vilje.

## Scaffold-slots (KLAR:false, kun struktur + licensStatus, 0 item-tekst)

| skabelon | instrument | licensStatus | venter på |
|---|---|---|---|
| `cas1` | CAS-1 | licens-gated (MCT-Institute) | licens-svar + Viktor 3-linse (eget spor) |
| `wsas` | WSAS | afventer | ePROVIDE-svar + dansk verbatim |
| `whodas` | WHODAS 2.0 | afventer | WHO portal-licens + dansk verbatim |

*Ikke juridisk rådgivning. Licens = ophavsret, ikke GDPR.*
