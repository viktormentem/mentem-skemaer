// Raekkefoelge-gate: klientens orden maa ALDRIG bo i en licensgate.
//
// HVORFOR DEN FINDES, maalt af INFRA natten til 21-08-2026:
// index.html:1012 filtrerede batteriet gennem `OFFENTLIGT_KLAR` ALENE. Det register er
// en LICENSGATE (hvem maa vises paa den uautentificerede flade). Fordi filtret var et
// `.filter()` paa netop den liste, blev licensgatens raekkefoelge til KLIENTENS
// raekkefoelge, og `?s=`-ordenen blev kasseret.
//
// Foelgen var ikke teoretisk: Viktors ratificerede raekkefoelge (Q12=1, 20-08: who5 ->
// wsas -> gad7 -> phq9, saa selvmordsitemet i phq9 ligger sidst og taettest paa Akut
// hjaelp) kunne kun opfyldes ved at REDIGERE EN LICENSGATE. En gate der aendres af en
// brugervenlighedsgrund, holder op med at vaere en gate.
//
// 🔴 DERFOR ER DE TO REGISTRE FORSKELLIGT ORDNET MED VILJE, og det er selve
// maaleinstrumentet: var de ens, kunne ingen proeve se hvilken af dem koden laeste, og
// en mutant der byttede tilbage til licensgaten ville staa GROEN. Forskellen er naalen.
//
// Koeres: node test/raekkefoelge-gate.mjs        Selvtest: node test/raekkefoelge-gate.mjs --selftest
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { SKEMA_ORDER, OFFENTLIGT_KLAR, KLIENT_RAEKKEFOELGE, SKEMAER } from '../mentem-skema-core.js';

let fejl = 0;
const ok = (c, n) => { console.log((c ? '  ✓ ' : '  ✗ FAIL ') + n); if (!c) fejl++; };

// ── 0. INSTRUMENTETS EGEN KONTROL. Naegter at doemme hvis naalen er doed ──────
// Husets regel: et maaleskript maaler foerst SIG SELV og afgiver ingen dom hvis den
// kontrol fejler. rc 3 = UMAALT, aldrig 1 (som er »maalt og roed«).
// POS og NEG rammer GENNEM datakilden (den rigtige index.html), ikke uden om den.
const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(here, '..', 'index.html'), 'utf8');
const selLinje = (html.match(/^\s*let selected = .*$/m) || [''])[0];

const pos = selLinje.includes('KLIENT_RAEKKEFOELGE');            // skal findes
const neg = /^\s*let selected = OFFENTLIGT_KLAR\.filter\(id => rawSelected\.includes\(id\)\);\s*$/
              .test(selLinje);                                    // maa IKKE findes: den GAMLE form
if (!(selLinje.trim() && pos && !neg)) {
  console.error('INSTRUMENTET ER DOEDT, ingen dom afgives.');
  console.error(`  linje fundet: ${selLinje.trim() ? 'ja' : 'NEJ'} · POS(ordens-register naevnt): ${pos} · NEG(gammel form): ${neg}`);
  process.exit(3);
}

console.log('Raekkefoelge-gate (orden og licens er TO registre):');

// ── 1. De to registre er adskilte, og deres FORSKEL er selve instrumentet ────
ok(Array.isArray(KLIENT_RAEKKEFOELGE) && KLIENT_RAEKKEFOELGE.length > 0,
   'KLIENT_RAEKKEFOELGE er et ikke-tomt register');
ok(new Set(KLIENT_RAEKKEFOELGE).size === KLIENT_RAEKKEFOELGE.length,
   'KLIENT_RAEKKEFOELGE har ingen dubletter');
ok(KLIENT_RAEKKEFOELGE.join(',') !== OFFENTLIGT_KLAR.join(','),
   '🔴 de to registre er FORSKELLIGT ORDNET (ellers kan ingen proeve se hvilken der blev laest)');
ok(KLIENT_RAEKKEFOELGE.join(',') !== SKEMA_ORDER.filter(id => KLIENT_RAEKKEFOELGE.includes(id)).join(','),
   '🔴 ordenen er heller ikke SKEMA_ORDERs (den er valgt klinisk, ikke arvet fra et register)');

// ── 2. Medlemskab vinder over orden ─────────────────────────────────────────
ok(new Set(KLIENT_RAEKKEFOELGE).size === new Set(OFFENTLIGT_KLAR).size &&
   KLIENT_RAEKKEFOELGE.every(id => OFFENTLIGT_KLAR.includes(id)),
   'de to registre daekker praecis de SAMME id (kun ordenen adskiller dem)');
for (const id of KLIENT_RAEKKEFOELGE) {
  ok(id in SKEMAER, `'${id}' er et registreret skema i SKEMAER`);
}

// ── 3. Viktors ratificerede orden, Q12=1 (20-08) ────────────────────────────
// 🔵 Denne assert er den ENESTE der binder en konkret ordlyd, og det er med vilje:
// den er en RATIFICERET BESLUTNING, ikke en implementeringsdetalje. AEndres den, skal
// den aendres af Viktor, og saa skal denne linje aendres i samme arbejde.
ok(KLIENT_RAEKKEFOELGE.join(',') === 'who5,wsas,gad7,phq9',
   'ordenen er Viktors Q12=1: trivsel, hverdag, bekymring, humoer');
ok(KLIENT_RAEKKEFOELGE[KLIENT_RAEKKEFOELGE.length - 1] === 'phq9',
   '🔴 phq9 er SIDST (den baerer selvmordsitemet og hoerer taettest paa Akut hjaelp)');

// ── 4. Kaldestedet: filtret kraever BEGGE registre ───────────────────────────
ok(selLinje.includes('KLIENT_RAEKKEFOELGE') && selLinje.includes('OFFENTLIGT_KLAR'),
   'filtret kraever BEGGE registre (orden fra det ene, medlemskab fra det andet)');
ok(/^\s*let selected = KLIENT_RAEKKEFOELGE\s*\n?\s*\.?filter|let selected = KLIENT_RAEKKEFOELGE\.filter/.test(selLinje),
   'ORDENEN driver filtret (KLIENT_RAEKKEFOELGE er modtageren, ikke argumentet)');

// ── 5. Anti-vakuum: taeller populationen strukturelt, ad en akse naalene ikke roerer ──
// Spoergsmaalet »saa jeg overhovedet noget?« maa ikke kunne besvares af de samme
// strenge som asserterne ovenfor laeser. Her taelles registrenes STOERRELSE mod SKEMAER.
const daekket = KLIENT_RAEKKEFOELGE.filter(id => id in SKEMAER).length;
ok(daekket === KLIENT_RAEKKEFOELGE.length && daekket >= 4,
   `anti-vakuum: ${daekket} af ${KLIENT_RAEKKEFOELGE.length} id findes i SKEMAER (mindst 4 forventet)`);

console.log(fejl ? `\nRAEKKEFOELGE-GATE FAILED ❌ (${fejl})` : '\nRAEKKEFOELGE-GATE PASSED ✅');
process.exit(fejl ? 1 : 0);
