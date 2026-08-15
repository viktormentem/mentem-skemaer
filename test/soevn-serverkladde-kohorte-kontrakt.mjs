// soevn-serverkladde-kohorte-kontrakt.mjs
//
// 🔴 HVORFOR DEN FINDES (15/8). Viktor gav GO til at aabne server-kladden »for alle
// fremtidige, da de gamle med lokallagring skal fortsaette som det er nu«. Foer flippet
// blev praemissen efterproevet, og der laa en ladt faelde: `serverTilladt` blev frosset
// som en HARDKODET `true` ved foerste gemning , ogsaa mens `LOCAL_ONLY` var sat.
// Enhver dagbog paabegyndt siden kohorte-gaten gik live bar derfor allerede `true`,
// mens klienten laeste »De sendes ikke nogen steder undervejs«. Et flip ville have sendt
// netop de klienters HELE akkumulerede dagbog. **Gaten daekkede doeren, ikke vinduet.**
//
// Denne kontrakt laaser de fire led i kaeden, saa de ikke kan glide fra hinanden igen.
// Den henter INTET fra nettet og starter ingen browser: den laeser kilden og koerer den
// rene logik, samme teknik som husets oevrige kontrakt-proever.
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
let fejl = 0, ok = 0;
const check = (navn, betingelse, detalje = '') => {
  if (betingelse) { ok++; console.log(`  ✓ ${navn}`); }
  else { fejl++; console.error(`  ✗ ${navn}${detalje ? ` :: ${detalje}` : ''}`); }
};

console.log('server-kladdens kohorte-kontrakt:');

// ── 1. Den frosne vaerdi skal AFLEDES af kontakten, aldrig hardkodes ──────────
const fryslinje = html.match(/diaryState = loadCSD\(\) \|\| \{[^}]*\}/);
check('frys-linjen kunne laeses ud af kilden', !!fryslinje);
if (fryslinje) {
  const l = fryslinje[0];
  check('serverTilladt AFLEDES af LOCAL_ONLY', /serverTilladt:\s*!LOCAL_ONLY/.test(l),
    l.slice(-90));
  // 🔴 NEG-KTRL paa netop den fejl der lige er rettet. Uden den ville »indeholder
  // !LOCAL_ONLY« vaere groen selv hvis nogen skrev `serverTilladt: true || !LOCAL_ONLY`.
  check('serverTilladt er IKKE hardkodet true', !/serverTilladt:\s*true/.test(l), l.slice(-90));
}

// ── 2. Kaeden fra kontakt til fetch skal vaere ubrudt ─────────────────────────
// Fire led, og det oeverste er en konstant. Falder eet af dem, kan klientdata naa en
// server ved et uheld, og det er den ene ting hele konstruktionen findes for.
check('led 1: serverTilladtForForloeb kortslutter paa LOCAL_ONLY',
  /function serverTilladtForForloeb\(\)\s*\{\s*if \(LOCAL_ONLY\) return false;/.test(html));
check('led 2: draftBase returnerer tom naar forloebet ikke er tilladt',
  /function draftBase\(\)\s*\{ if \(!serverTilladtForForloeb\(\)\) return '';/.test(html));
check('led 3: draftEnabled kraever en ikke-tom draftBase',
  /function draftEnabled\(\)[^\n]*draftBase\(\)/.test(html));

// 🔴 led 4: HVERT fetch mod draft-ruten skal ligge bag draftEnabled. Naalen taeller frem
// for at stikproeve: et nyt fetch tilfoejet uden gate er praecis den regression der ikke
// maa kunne glide ind, og en stikproeve ville ikke se det femte kald.
const fetches = (html.match(/fetch\(draftUrl\(\)/g) || []).length;
// 🔴 Naalen var foerst `if (!draftEnabled())` med lukkende parentes, og den gav 2 af 3:
// den ene gate baerer ekstra betingelser (`|| !keyCheck.ok || !consentAccepted() || ...`).
// Proeven meldte altsaa en manglende gate der ikke manglede. **Et regex der kraever at
// betingelsen staar ALENE, maaler en formatering og ikke en gate.**
const gates = (html.match(/if \(!draftEnabled\(\)/g) || []).length;
check(`led 4: alle ${fetches} draft-fetch har en draftEnabled-gate (${gates} gates)`,
  fetches > 0 && gates >= fetches, `fetches=${fetches} gates=${gates}`);
// POS-KTRL paa naalen: findes der overhovedet et draft-fetch at maale paa? Et nul ville
// ellers laese som »alle er gatet«.
check('POS-KTRL: der FINDES draft-fetches at maale paa', fetches >= 3, `fandt ${fetches}`);

// ── 3. Kontaktens position er en Viktor-beslutning ───────────────────────────
// 🟡 Ikke en dom over vaerdien, men et krav om at den er EKSPLICIT og laesbar. Skifter
// den, skal det ske i en commit nogen har skrevet med vilje.
const flag = html.match(/const LOCAL_ONLY = (true|false);/);
check('LOCAL_ONLY er en eksplicit boolsk konstant', !!flag, flag ? flag[1] : 'ikke fundet');
if (flag) console.log(`  🔵 kontaktens position lige nu: LOCAL_ONLY = ${flag[1]}`);

console.log(`\n${ok} ok · ${fejl} fejl`);
process.exit(fejl ? 1 : 0);
