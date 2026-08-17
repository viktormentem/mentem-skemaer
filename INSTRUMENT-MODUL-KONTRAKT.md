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
  showValueBadge: false,            // synligt tal-badge på svarknap (KUN hvis "højere tal = bedre")
  safetyKey: 'foo_item_9',          // valgfri: item > 0 → prominent safety-panel (112/Livslinien)
  funktion: { key, optional, text, options },  // valgfri funktionslinje (tæller IKKE i sum)
  // Licens-/parathedsflag (HÅRD, spec §4):
  licensStatus: 'public-domain' | 'fri-m-kildeangivelse' | 'licens-gated' | 'afventer',
  KLAR: true | false,
};
```

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

## Sådan tager du et nyt instrument i brug (når licens + verbatim lander)

1. Find scaffold-slottet (fx `CAS1_INSTRUMENT_SLOT`) ELLER tilføj et nyt modul-objekt.
2. Indsæt verbatim `instruktion`/`stem`/`scoredItems`/`options` mellem
   `// emdash-guard:instrument-start` og `// emdash-guard:instrument-end` (verbatim er undtaget
   æøå-/em-dash-reglen; vores EGEN UI-copy i index.html forbliver em-dash-fri).
3. Tilføj evt. afledningsregel i `instrumentFeltOrden()` + `instrumentDerived()` (sum/pct/flag).
4. Sæt `licensStatus` korrekt + flip `KLAR: true`.
5. **Skal instrumentet være KLIENTVENDT (altså med i `OFFENTLIGT_KLAR`): giv det en §3l-form i
   `INSTRUMENT_LICENS` FØRST.** `grundlag: 'A'` (dokumenteret gratis/public domain/open source,
   med `kilde` + ISO-dateret `verificeret`) eller `grundlag: 'B'` (`betingelser: [{krav,
   status}]`, hvor HVER status skal være `opfyldt`). Uden form blokerer
   `test/licens-3l-gate.mjs` push til main. Viktor-beslutning §3l (17/8): et instrument uden
   dokumenteret grundlag hører ikke på en klientvendt flade.
6. Kør `node test/instrument-mycel.mjs` + `node test/instrument-klar-gate.mjs` +
   `node test/licens-3l-gate.mjs` (+ selftest + emoji/emdash). Nul genbygning af render-motoren.

## Aktiv nu (KLAR:true)

| skabelon | instrument | licensStatus | verbatim |
|---|---|---|---|
| `who5` | WHO-5 | fri-m-kildeangivelse (WHO 1998) | verificeret |
| `phq9` | PHQ-9 | public-domain (Pfizer 2010) | verificeret |
| `gad7` | GAD-7 | public-domain (Pfizer 2010) | verificeret |

## Scaffold-slots (KLAR:false, kun struktur + licensStatus, 0 item-tekst)

| skabelon | instrument | licensStatus | venter på |
|---|---|---|---|
| `cas1` | CAS-1 | licens-gated (MCT-Institute) | licens-svar + Viktor 3-linse (eget spor) |
| `wsas` | WSAS | afventer | ePROVIDE-svar + dansk verbatim |
| `whodas` | WHODAS 2.0 | afventer | WHO portal-licens + dansk verbatim |

*Ikke juridisk rådgivning. Licens = ophavsret, ikke GDPR.*
