// modul-parse-gate.mjs · svarer paa EET spoergsmaal: PARSER de inline modulblokke?
//
// HVORFOR DEN FINDES (maalt af INFRA 22-08 under review af PR #52)
// MYCEL BUILDER oploeste en merge-konflikt med »tag begge sider«. Begge sider bar en
// `let selected`, saa der stod to i samme scope, HELE modulet fejlede at parse, og
// instrument-skaermen rendrede 0 af 8 spoergsmaal.
//
// Husets 12 gates DAEKKEDE fejlen: e2e-testene goto'er index.html og var gaaet roede.
// Men INGEN af dem NAVNGAV den. De faldt paa en locator-timeout, altsaa en dom der
// peger et andet sted hen end sin aarsag, og den der laeser navnet, leder foerst i sit
// eget arbejde. Praecis samme figur som de tre roede gates der ikke sagde »der er to ESS«.
//
// Denne gate koster millisekunder og siger fil, linje og aarsag. Den erstatter ingen
// e2e: den staar FOER dem, saa en syntaksfejl aldrig igen koster en Playwright-koersel
// at opdage og et gaet at forstaa.
//
// rc 0 alle blokke parser · rc 1 en blok parser ikke · rc 3 instrumentet er doedt

import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

// SEAM: roden er overstyrbar, saa den ROEDE gren kan proeves mod et fikstur-trae uden
// at nogen skal mutere husets egen index.html. Uden seamet ville rc 1-grenen aldrig
// vaere blevet koert, og en vagts sidste gren er den mindst proevede.
const ROD = process.env.MODUL_PARSE_ROD || join(dirname(fileURLToPath(import.meta.url)), '..');
const FLADER = ['index.html', 'anmod.html', 'inbox-enroll.html', 'inbox-view.html'];
const TMP = mkdtempSync(join(tmpdir(), 'modul-parse-'));

function blokke(html) {
  // offset foelger med: node --check taeller linjer i BLOKKEN, og en dom der peger paa
  // »linje 403« i en fil paa 4000 linjer sender laeseren det forkerte sted hen. Hele
  // gatens formaal er at pege paa aarsagen, saa den skal oversaette tilbage til fladen.
  return [...html.matchAll(/<script\s+type="module"[^>]*>([\s\S]*?)<\/script>/g)]
    .map(m => ({ kode: m[1], offset: html.slice(0, m.index).split('\n').length }));
}
function parser(kode, navn) {
  const p = join(TMP, navn);
  writeFileSync(p, kode, 'utf8');
  try { execFileSync(process.execPath, ['--check', p], { stdio: 'pipe' }); return null; }
  catch (e) { return String(e.stderr || e.message).split('\n').slice(0, 4).join('\n'); }
}

// ── SELVKONTROL: naegter at doemme hvis naalen er blind ────────────────────────
// POS og NEG rammer GENNEM datakilden (den aegte index.html), ikke gennem en fikstur
// ved siden af. NEG er et naer-miss: samme fil, uden mutationen.
const KTRL_ROD = join(dirname(fileURLToPath(import.meta.url)), '..');  // selvkontrollen laeser ALTID husets egen fil
const ktrlHtml = readFileSync(join(KTRL_ROD, 'index.html'), 'utf8');
const ktrlBlok = (blokke(ktrlHtml)[0] || {}).kode;
if (!ktrlBlok) { console.error('INSTRUMENTET ER DOEDT: 0 modulblokke i index.html, ingen dom'); process.exit(3); }
const pos = parser(ktrlBlok + '\nlet selected = 1;\n', 'pos.mjs');   // SKAL fejle
const neg = parser(ktrlBlok, 'neg.mjs');                             // SKAL vaere ren
if (!(pos && !neg)) {
  console.error(`INSTRUMENTET ER DOEDT, ingen dom: POS ${pos ? 'fangede' : 'MISSEDE'} en paalimet dublet, NEG ${neg ? 'FALSK-RAMTE den rene fil' : 'var ren'}`);
  process.exit(3);
}

// ── DOMMEN ────────────────────────────────────────────────────────────────────
console.log('Modul-parse-gate (parser de inline modulblokke overhovedet?):');
console.log(`  ✓ selvkontrol: POS fanger en paalimet dublet, NEG rammer ikke den rene fil`);
let blokIalt = 0, fejl = 0;
for (const fil of FLADER) {
  let html;
  try { html = readFileSync(join(ROD, fil), 'utf8'); }
  catch { console.log(`  -  ${fil}: findes ikke, sprunget over`); continue; }
  const bs = blokke(html);
  if (bs.length === 0) { console.log(`  -  ${fil}: 0 modulblokke (ingen at proeve)`); continue; }
  bs.forEach((b, i) => {
    blokIalt++;
    const e = parser(b.kode, `${fil.replace(/\W/g, '_')}-${i}.mjs`);
    const n = b.kode.split('\n').length;
    if (e) {
      fejl++;
      // oversaet blok-linjen til fladens egen linje, saa dommen peger paa aarsagen
      const m = e.match(/\.mjs:(\d+)/);
      const hvor = m ? `${fil}:${Number(m[1]) + b.offset - 1}` : `${fil} blok ${i}`;
      console.log(`  ✗  ${hvor} PARSER IKKE (blok ${i}, ${n} linjer):\n${e.replace(/^[^\n]*\.mjs:\d+/, hvor)}`);
    } else { console.log(`  ✓  ${fil} blok ${i}: ${n} linjer parser`); }
  });
}
// anti-vakuum: en gate der proevede NUL blokke ville se groen ud
if (blokIalt === 0) { console.error('INSTRUMENTET ER DOEDT: 0 blokke proevet i alt, ingen dom'); process.exit(3); }
console.log(`  ✓  anti-vakuum: ${blokIalt} modulblok(ke) proevet over ${FLADER.length} flade(r)`);

if (fejl) { console.error(`\nMODUL-PARSE-GATE FAILED ❌  ${fejl} af ${blokIalt} blokke parser ikke`); process.exit(1); }
console.log(`\nMODUL-PARSE-GATE PASSED ✅  ${blokIalt} af ${blokIalt} blokke parser`);
