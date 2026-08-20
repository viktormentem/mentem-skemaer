// Batteri KLAR-gate guard (offentligheds-/licensgate for spørgeskema-batteriet).
// Analog til test/instrument-klar-gate.mjs, men for det batteri-register der lever i
// mentem-skema-core.js (SKEMA_ORDER/SKEMAER). Låser de to invarianter fra batteri-
// velkomst-licenslækken (noter/batteri-velkomst-licens-laek-2026-06-27):
//
//   B (lukker L2 — instrumentnavne i velkomst-/footer-copy):
//      ÉT register, OFFENTLIGT_KLAR, afgør hvad der må vises offentligt; footer-credit
//      er generisk og navngiver ALDRIG et instrument (GAD-7/PHQ-9/WHO-5/WSAS/WAI-SR).
//   C (lukker L1 — fuld-batteri-reklame på bar URL/ukendt/gated token):
//      renderWelcome falder IKKE tilbage til hele SKEMA_ORDER; et tomt/ugyldigt link
//      viser en "ufuldstændigt link"-skærm i stedet.
//
// Køres: node test/batteri-klar-gate.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { SKEMA_ORDER, OFFENTLIGT_KLAR, SKEMAER } from '../mentem-skema-core.js';

let fejl = 0;
function ok(cond, navn) { console.log((cond ? '  ✓ ' : '  ✗ FAIL ') + navn); if (!cond) fejl++; }

console.log('Batteri KLAR-gate guard (offentligheds-/licensgate, B+C):');

// ── 1. Register-invarianter (OFFENTLIGT_KLAR parallelt til SKEMA_ORDER) ──────
ok(Array.isArray(OFFENTLIGT_KLAR) && OFFENTLIGT_KLAR.length > 0, 'OFFENTLIGT_KLAR er et ikke-tomt register');
ok(new Set(OFFENTLIGT_KLAR).size === OFFENTLIGT_KLAR.length, 'OFFENTLIGT_KLAR har ingen dubletter');
for (const id of OFFENTLIGT_KLAR) {
  ok(SKEMA_ORDER.includes(id), `'${id}' er en delmængde af SKEMA_ORDER (intet fremmed id)`);
  ok(id in SKEMAER, `'${id}' er et registreret skema i SKEMAER`);
}
// Kanonisk rækkefølge bevares (OFFENTLIGT_KLAR er ordnet som SKEMA_ORDER) → batteriet
// rendres altid i samme rækkefølge uanset hvilket register der driver allowlisten.
const ordnet = SKEMA_ORDER.filter(id => OFFENTLIGT_KLAR.includes(id));
ok(ordnet.join(',') === OFFENTLIGT_KLAR.join(','), 'OFFENTLIGT_KLAR følger SKEMA_ORDERs kanoniske rækkefølge');

// ── 1b. CAS-1/MCB må ALDRIG rendres digitalt (Viktor-beslutning 2026-07-03, Wells-licens) ──
// De administreres kun på papir og indtastes separat i klient-record. OFFENTLIGT_KLAR er
// den offentlige allowlist (?s=-filter) → cas/mcb udeladt her = de kan ikke lække digitalt,
// heller ikke via et stale/manuelt ?s=cas-link. SKEMA_ORDER + SKEMAER-definitionerne bevares
// (licens-pending-mønster: fjern blot fra OFFENTLIGT_KLAR). Det digitale batteri = gad7/phq9/
// who5/wsas (+ waisr alliance).
ok(!OFFENTLIGT_KLAR.includes('cas'), "CAS-1 ('cas') er IKKE i OFFENTLIGT_KLAR (kun papir, Wells-licens)");
ok(!OFFENTLIGT_KLAR.includes('mcb'), "MCB ('mcb') er IKKE i OFFENTLIGT_KLAR (kun papir, Wells-licens)");
// waisr (WAI-SR alliance-selvrapport) SAFE-FAIL-ekskluderet 2026-07-03: en allowlist må
// KUN indeholde bekræftet-OK instrumenter. Koden annoterer waisr "frit/public domain", men
// det er en påstand i kilden, ikke en Viktor-ratificeret licens+egnetheds-bekræftelse →
// holdes ude til Viktor bekræfter (reversibelt: tilføjes igen ved GO). Må ikke optræde uden flag.
ok(!OFFENTLIGT_KLAR.includes('waisr'),
  "WAI-SR ('waisr') er IKKE i OFFENTLIGT_KLAR (safe-fail: afventer Viktor licens+egnetheds-bekræftelse)");
// 🔴 PROFIL-PRÆCISERING 19/7 — læs før du "retter" denne assert:
// Linjen låser den INTERNE profil (Viktors egen praksis, hvor WHO-5 og WSAS er lovlige).
// Den blev 19/7 kl. 12 meldt som en modsigelse mod licensregistret ("WSAS er offentligt
// live OG markeret afventer-licens"), fordi registret taler om PRODUKTET mens denne
// assert taler om INSTALLATIONEN. Med licens-profilerne er begge udsagn sande og måler
// hver sin ting: assert'en var ikke forkert, den var UMÆRKET.
// Produkt-siden bevogtes af test/licens-profil-gate.mjs (allowlistFor(PROFIL_PRODUKT)
// === gad7,phq9, fail-closed). Ændrer du denne, amputerer du Viktors egen flade.
ok(OFFENTLIGT_KLAR.join(',') === 'gad7,phq9,who5,wsas',
  'INTERN profil: det digitale batteri = gad7,phq9,who5,wsas (cas/mcb + waisr-pending fjernet)');

// ── 2. index.html-kontrakt (statisk kilde-tjek) ─────────────────────────────
const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(here, '..', 'index.html'), 'utf8');

// B: registret importeres + driver den offentlige allowlist (`selected`), ikke SKEMA_ORDER.
ok(/import \{[^}]*\bOFFENTLIGT_KLAR\b[^}]*\} from '\.\/mentem-skema-core\.js'/.test(html),
  'index.html importerer OFFENTLIGT_KLAR fra core');
ok(/let selected = OFFENTLIGT_KLAR\.filter\(id => rawSelected\.includes\(id\)\)/.test(html),
  'selected udledes af OFFENTLIGT_KLAR (offentlig allowlist), ikke SKEMA_ORDER');

// C: ingen fuld-SKEMA_ORDER-fallback-batteri tilbage; ufuldstændigt-link-skærm i stedet.
ok(!/fixedFromLink \? selected : SKEMA_ORDER/.test(html),
  'INGEN fuld-batteri-fallback (fixedFromLink ? selected : SKEMA_ORDER) tilbage (L1 lukket)');
ok(/if \(!fixedFromLink\) \{/.test(html) && /Dette link er ufuldstændigt/.test(html),
  'renderWelcome viser "ufuldstændigt link"-skærm når linket ikke bærer et gyldigt subset');

// B (L2): velkomst-footer-credit er generisk og navngiver INTET instrument.
// Scopet til footer-credit-strengene (statisk <p> + JS-drevet) — ikke JS-kommentarer
// (hvor fx PHQ-9-item-9-nudge legitimt nævnes).
const navne = /(GAD-7|PHQ-9|WHO-5|WSAS|WAI-SR)/;
const staticCredit = (html.match(/<p class="footer-credit" id="footer-credit"[^>]*>([^<]*)<\/p>/) || [])[1] || '';
ok(staticCredit.length > 0, 'statisk footer-credit findes (id="footer-credit")');
ok(!navne.test(staticCredit), 'statisk footer-credit navngiver INTET instrument (L2 lukket)');
// 🔴 DENNE ASSERT SPEJLEDE EN STRENG, IKKE EN EGENSKAB, og det kostede en roed gate paa en
// RIGTIG rettelse 20-08. Den lyd `/anerkendte, validerede spørgeskemaer/`, altsaa den ordlyd
// fodnoten tilfaeldigvis havde. Da »WSAS« blev omdoebt til husets egen skala, blev ordet
// »validerede« USANDT om listen, copyen blev rettet, og gaten gik roed paa noget der ikke er
// dens formaal. Gatens formaal staar i B ovenfor: fodnoten skal vaere GENERISK.
// ⇒ Den maaler nu to EGENSKABER i stedet, og er dermed straengere end foer:
//   1. fodnoten er en hel saetning (ikke en rest efter en halv redigering)
//   2. den paastaar ikke at ALLE skemaer er validerede. Mindst eet af dem er husets eget,
//      og dets egen attribution siger ordret »Ikke et valideret instrument«. To saetninger
//      paa samme flade maa ikke modsige hinanden.
ok(staticCredit.trim().length >= 40 && /\.$/.test(staticCredit.trim()),
  'statisk footer-credit er en hel saetning');
ok(!/validerede?\s+sp(ø|oe)rgeskemaer/i.test(staticCredit),
  'statisk footer-credit paastaar IKKE at alle skemaer er validerede (mindst eet er husets eget)');
const jsCredit = (html.match(/credit\.textContent = OFFENTLIGT_KLAR\.length[\s\S]*?:\s*'';/) || [''])[0];
ok(jsCredit.length > 0 && !navne.test(jsCredit), 'JS-drevet footer-credit (af OFFENTLIGT_KLAR) navngiver INTET instrument');

console.log(fejl === 0 ? '\nBATTERI KLAR-GATE GUARD PASSED ✅' : '\nBATTERI KLAR-GATE GUARD FAILED ❌ (' + fejl + ')');
process.exit(fejl === 0 ? 0 : 1);
