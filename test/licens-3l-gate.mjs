// licens-3l-gate — RATCHET for Viktor-beslutning §3l (2026-08-17).
//
// Ordret: »Alle licensinstrumenter skal være helt afklaret før de kommer live der er
// klientvendt fx ved at have dokumenteret det er gratis/open source eller hvilke
// betingelserne der skal være opfyldt.«
//
// To tilladte former og intet tredje:
//   A  FRIT      dokumenteret gratis/public domain/open source, med KILDE og dato
//   B  BETINGET  licens findes, og HVER betingelse staar som en tjekbar raekke med status
//
// HVAD DEN DOEMMER PAA, og hvorfor netop dét:
//   `OFFENTLIGT_KLAR` er den liste der afgoer hvad en klient kan faa vist paa en
//   uautentificeret flade. Registret i Projekt_Praksis/noter/ er PROSA-sandheden, men det
//   ligger i et ANDET repo og er permanent gitignoreret (klient-PII). Maalt 17/8:
//   `git check-ignore` rammer paa `/noter/*`, og filen har 0 commits. En gate der doemte
//   paa den, ville hvile paa noget der ikke foelger med den commit den doemmer.
//   ⇒ Gaten doemmer paa `INSTRUMENT_LICENS[id].grundlag`, som bor i SAMME fil som fladen.
//
// RATCHETTEN, tre arme, og de to sidste er hele pointen:
//   1. Et id paa fladen UDEN form A/B og UDEN en baseline-raekke  => ROED. (Nye huller.)
//   2. En baseline-raekke hvis id nu HAR form A/B                 => ROED. (Overfloedig
//      undtagelse. En fritagelse der overlever sin grund, er et hul med et alibi.)
//   3. En baseline-raekke hvis id ikke laengere er paa fladen     => ROED. (Doed
//      undtagelse. Den ville daekke et id der kom TILBAGE paa fladen, tavst.)
//   ⇒ Listen kan kun blive kortere. Det er forskellen paa en ratchet og en tilladelsesliste.
//
// Koeres: node test/licens-3l-gate.mjs
// Kaldested: .githooks/pre-push (blokerer push til main), jf. INSTRUMENT-MODUL-KONTRAKT.md.
//
// EXITKODER (husets konvention, CLAUDE.md §»Et maaleskript naegter at doemme«):
//   0 = maalt groent · 1 = maalt roedt · 3 = INSTRUMENTET ER DOEDT, ingen dom afgives.
import {
  OFFENTLIGT_KLAR, INSTRUMENT_LICENS, LICENS_3L_BASELINE,
} from '../mentem-skema-core.js';

const ISO_DATO = /^\d{4}-\d{2}-\d{2}$/;
const STATUS_OK = new Set(['opfyldt', 'ikke opfyldt']);

// ── Selve dommen, som en REN funktion over et injiceret grundlag ─────────────
// Injicerbar, saa POS- og NEG-kontrollen kan ramme GENNEM datakilden frem for uden om den.
// Returnerer en liste af fejl-strenge; tom liste = groen.
export function doemTreL(flade, licenser, baseline) {
  const fejl = [];

  for (const id of flade) {
    const l = licenser[id];
    const b = baseline[id];
    if (!l) { fejl.push(`${id}: staar paa fladen uden opslag i INSTRUMENT_LICENS`); continue; }

    if (l.grundlag === 'A') {
      if (!l.kilde) fejl.push(`${id}: form A uden 'kilde' (en paastand uden kilde er ikke dokumentation)`);
      if (!ISO_DATO.test(l.verificeret || '')) fejl.push(`${id}: form A uden gyldig 'verificeret'-dato (YYYY-MM-DD)`);
    } else if (l.grundlag === 'B') {
      const raekker = Array.isArray(l.betingelser) ? l.betingelser : [];
      if (raekker.length === 0) {
        fejl.push(`${id}: form B uden 'betingelser' — »licensen er vist i orden« er ikke en betingelse`);
      }
      raekker.forEach((r, i) => {
        if (!r || !r.krav) fejl.push(`${id}: betingelse ${i} mangler 'krav'`);
        if (!r || !STATUS_OK.has(r.status)) {
          fejl.push(`${id}: betingelse ${i} har status '${r && r.status}' (skal vaere opfyldt / ikke opfyldt)`);
        }
      });
      // 🔴 En form B med en UOPFYLDT betingelse er praecis det §3l forbyder. ESS er det
      // levende eksempel: licensen findes, men screenshot-review mangler, og saa maa den
      // ikke staa klientvendt. »Betingelserne er kendt« er ikke »betingelserne er opfyldt«.
      const aabne = raekker.filter(r => r && r.status === 'ikke opfyldt').map(r => r.krav);
      if (aabne.length) fejl.push(`${id}: form B med ${aabne.length} UOPFYLDT betingelse(r) paa en klientvendt flade: ${aabne.join(' · ')}`);
    } else if (b) {
      // Kendt gulv. Ikke groent, men heller ikke en ny regression: den staar navngivet,
      // dateret og med sin lukke-betingelse. Rapporteres gult nedenfor.
    } else {
      fejl.push(`${id}: INGEN FORM (grundlag=${JSON.stringify(l.grundlag)}) og ingen baseline-raekke `
              + `— §3l: et instrument uden form A eller B hoerer ikke paa en klientvendt flade`);
    }
  }

  // Arm 2 + 3: gulvet kan kun blive kortere.
  for (const [id, b] of Object.entries(baseline)) {
    if (!flade.includes(id)) {
      fejl.push(`baseline '${id}': staar ikke paa fladen laengere — fjern raekken (en doed undtagelse daekker et id der kommer tilbage)`);
      continue;
    }
    const g = licenser[id]?.grundlag;
    if (g === 'A' || g === 'B') {
      fejl.push(`baseline '${id}': har nu form ${g} — fjern raekken (en fritagelse der overlever sin grund, er et hul med et alibi)`);
    }
    if (!b.siden || !ISO_DATO.test(b.siden)) fejl.push(`baseline '${id}': mangler gyldig 'siden'-dato`);
    if (!b.lukkes_ved) fejl.push(`baseline '${id}': mangler 'lukkes_ved' — en undtagelse uden lukke-betingelse er permanent`);
  }

  return fejl;
}

// ── INSTRUMENTETS EGEN KONTROL ──────────────────────────────────────────────
// Kravet er ikke »een POS og een NEG«: EEN ANKER MAALER EEN FORM. Kontrolsaettet skal
// spaende de former populationen faktisk har, og dommen er et TAL med en ENHED.
// Alle fire rammer GENNEM datakilden (et injiceret licens-/baseline-objekt), aldrig uden om.
const KONTROLLER = [
  { navn: 'POS form A komplet => groen',
    flade: ['x'],
    lic: { x: { grundlag: 'A', kilde: 'k', verificeret: '2026-01-01' } },
    base: {}, venter: 0 },
  { navn: 'NEG form A uden dato => roed',
    flade: ['x'],
    lic: { x: { grundlag: 'A', kilde: 'k', verificeret: 'engang i juli' } },
    base: {}, venter: 1 },
  { navn: 'NEG ingen form, intet gulv => roed',
    flade: ['x'],
    lic: { x: { grundlag: null, kilde: 'k', verificeret: '2026-01-01' } },
    base: {}, venter: 1 },
  { navn: 'POS ingen form MED gulv => groen (gulvet baerer den)',
    flade: ['x'],
    lic: { x: { grundlag: null, kilde: 'k', verificeret: '2026-01-01' } },
    base: { x: { siden: '2026-08-17', hvorfor: 'h', lukkes_ved: 'l' } }, venter: 0 },
  { navn: 'NEG form B med uopfyldt betingelse => roed',
    flade: ['x'],
    lic: { x: { grundlag: 'B', kilde: 'k', verificeret: '2026-01-01',
                betingelser: [{ krav: 'screenshot-review', status: 'ikke opfyldt' }] } },
    base: {}, venter: 1 },
  { navn: 'NEG overfloedigt gulv (id har faaet form A) => roed',
    flade: ['x'],
    lic: { x: { grundlag: 'A', kilde: 'k', verificeret: '2026-01-01' } },
    base: { x: { siden: '2026-08-17', hvorfor: 'h', lukkes_ved: 'l' } }, venter: 1 },
  { navn: 'NEG doedt gulv (id ikke paa fladen) => roed',
    flade: [],
    lic: {},
    base: { x: { siden: '2026-08-17', hvorfor: 'h', lukkes_ved: 'l' } }, venter: 1 },
];

let kontrolFejl = 0;
const kontrolLinjer = [];
for (const k of KONTROLLER) {
  const n = doemTreL(k.flade, k.lic, k.base).length;
  const holdt = k.venter === 0 ? n === 0 : n >= 1;
  if (!holdt) kontrolFejl++;
  kontrolLinjer.push(`     ${holdt ? '·' : '✗'} ${k.navn} -> ${n} fejl`);
}

console.log('licens-3l-gate (§3l: intet licensinstrument klientvendt live uden afklaret grundlag)');
console.log(`  kontrolsaet: ${KONTROLLER.length - kontrolFejl} af ${KONTROLLER.length} former holdt`);
if (kontrolFejl) {
  kontrolLinjer.forEach(l => console.error(l));
  console.error('🛑 INSTRUMENTET ER DOEDT, ingen dom afgives '
              + `(${kontrolFejl} af ${KONTROLLER.length} kontrolformer svigtede).`);
  process.exit(3);
}

// ── DOMMEN over det aegte register ──────────────────────────────────────────
const fejl = doemTreL(OFFENTLIGT_KLAR, INSTRUMENT_LICENS, LICENS_3L_BASELINE);

// Taellingen sker paa den UAFKORTEDE population; visningen maa gerne afkortes.
const paaFladen = OFFENTLIGT_KLAR.length;
const medForm = OFFENTLIGT_KLAR.filter(id => ['A', 'B'].includes(INSTRUMENT_LICENS[id]?.grundlag)).length;
const paaGulvet = OFFENTLIGT_KLAR.filter(id => LICENS_3L_BASELINE[id]).length;

console.log(`  klientvendt flade: ${paaFladen} instrument(er) · ${medForm} med form A/B · ${paaGulvet} paa §3l-gulvet`);
for (const id of OFFENTLIGT_KLAR) {
  const g = INSTRUMENT_LICENS[id]?.grundlag;
  const b = LICENS_3L_BASELINE[id];
  if (g === 'A' || g === 'B') console.log(`     ✓ ${id} · form ${g}`);
  else if (b) console.log(`     🟡 ${id} · INGEN FORM, paa gulvet siden ${b.siden} · lukkes ved: ${b.lukkes_ved}`);
}

if (fejl.length) {
  console.error(`  ✗ FAIL — ${fejl.length} §3l-brud:`);
  fejl.forEach(f => console.error(`     ✗ ${f}`));
  console.error('🛑 licens-3l-gate ROED.');
  process.exit(1);
}

// 🔴 DEN GROENNE GREN MED ET TOMT GULV BLEV NAAET FOERSTE GANG 20-08 kl. 20.1x, og den lyd
// »0 kendt(e) undtagelse(r) paa gulvet, se ovenfor«. »Se ovenfor« peger paa ingenting naar
// tallet er nul, og en henvisning til et tomt sted laeser som en fejl i vagten frem for som
// den gode nyhed det er. Husets egen regel: den gren der kun naas naar alt andet er groent,
// er den der aldrig er blevet laest (SUBSTRAT 6/8). Den koster eet blik paa den ene dag hvor
// den er billig at proeve, nemlig den dag man lige har naaet den.
console.log(paaGulvet === 0
  ? 'licens-3l-gate ✓ - 0 nye §3l-brud, og gulvet er TOMT: hver klientvendt flade har form A eller B'
  : `licens-3l-gate ✓ - 0 nye §3l-brud (${paaGulvet} kendt(e) undtagelse(r) paa gulvet, se ovenfor)`);
