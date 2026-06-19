// anmod-smoke.mjs — chromium smoke-test af anmod.html (ANMOD v2.1 adaptiv flow).
//
// Verificerer i en ÆGTE browser (headless chromium via playwright):
//   1. Siden loader uden uncaught JS-/console-fejl (modul-import + render).
//   2. Adaptiv forgrening: grundlag=psykiater → henvisning + forloeb_tilbudt vises;
//      forloeb_tilbudt=gruppe → tid_praeference vises; forsikring → alt skjules.
//   3. Happy-path: psykiater + henvisning + gruppe + tid + 2 samtykker → submit bygger
//      og KRYPTERER en ÆGTE konvolut (WebCrypto X25519) → kvitteringsskærm (TEST_HOST-preview).
//
// Kør: node test/anmod-smoke.mjs   (exit 0 = grøn)   ·   SHOT_DIR=<dir> gemmer See-it-screenshots.

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SITE_DIR = path.resolve(fileURLToPath(new URL('../', import.meta.url)));   // mentem-skemaer/
const PW_DIR = process.env.PW_DIR
  || '/Users/viktornielsen/Documents/MEMTEM/PsykologInvitation/e2e/playwright/node_modules';
const SHOT_DIR = process.env.SHOT_DIR || '';

let fails = 0;
const log = (...a) => console.log(...a);
function check(cond, label, extra = '') { if (cond) log('  OK ', label); else { log('  XX ', label, extra); fails++; } }

// ── Lokal statisk http-server (origin 127.0.0.1 → TEST_HOST true i anmod.html) ──
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/' || p === '') p = '/index.html';
  const fp = path.join(SITE_DIR, path.normalize(p));
  if (!fp.startsWith(SITE_DIR) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) {
    res.writeHead(404); res.end('not found'); return;
  }
  res.writeHead(200, { 'content-type': MIME[path.extname(fp)] || 'application/octet-stream' });
  fs.createReadStream(fp).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const SITE = `http://127.0.0.1:${server.address().port}`;

let chromium;
try { ({ chromium } = await import(path.join(PW_DIR, 'playwright', 'index.mjs'))); }
catch { ({ chromium } = (await import(path.join(PW_DIR, 'playwright', 'index.js'))).default); }

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

// Fang uncaught JS-fejl + console.error (regressions-vagt på render-stien). Net-/HTTP-ressource-
// fejl ignoreres bevidst: i preview (TEST_HOST) AFVISER ingest-worker den syntetiske submission
// (401) — det er FORVENTET og håndteres af formularen (kvittering-preview), ikke en JS-regression.
const pageErrors = [];
const erRessourceFejl = (s) => /Failed to load resource|net::ERR|ingest\.mycel\.dk|\/submit/i.test(s);
page.on('pageerror', (e) => pageErrors.push(String(e)));
page.on('console', (m) => {
  if (m.type() !== 'error') return;
  const t = 'console.error: ' + m.text();
  if (!erRessourceFejl(t)) pageErrors.push(t);
});

async function shot(name) { if (SHOT_DIR) { try { await page.screenshot({ path: path.join(SHOT_DIR, name), fullPage: true }); log('   shot ->', name); } catch {} } }
const vis = (sel) => page.locator(sel).isVisible();
async function pick(sel) { await page.check(sel); }   // radio/checkbox via .check (trigger 'change')

try {
  console.log('anmod v2.1 chromium-smoke:', SITE + '/anmod.html');
  await page.goto(`${SITE}/anmod.html`, { waitUntil: 'load' });
  await page.waitForSelector('#grp-grundlag .radio-option');   // render kørte
  check(pageErrors.length === 0, 'loader uden JS-/console-fejl', pageErrors.join(' | '));

  // Initialtilstand: psykiater-grenens blokke skjult.
  check(!(await vis('#block-henvisning')), 'init: henvisning skjult');
  check(!(await vis('#block-tilbudt')),    'init: forloeb_tilbudt skjult');
  check(!(await vis('#block-tid')),        'init: tid_praeference skjult');

  // grundlag=psykiater → henvisning + forloeb_tilbudt vises.
  await pick('input[name="grundlag"][value="psykiater"]');
  check(await vis('#block-henvisning'), 'psykiater: henvisning vist');
  check(await vis('#block-tilbudt'),    'psykiater: forloeb_tilbudt vist');
  check(!(await vis('#block-tid')),     'psykiater: tid endnu skjult (intet forløb valgt)');
  await shot('anmod-v21-psykiater.png');

  // forloeb_tilbudt=gruppe → tid_praeference vises.
  await pick('input[name="forloeb_tilbudt"][value="gruppe"]');
  check(await vis('#block-tid'), 'gruppe: tid_praeference vist');
  await shot('anmod-v21-gruppe-tid.png');

  // forloeb_tilbudt=individuelt → tid skjules igen.
  await pick('input[name="forloeb_tilbudt"][value="individuelt"]');
  check(!(await vis('#block-tid')), 'individuelt: tid skjult igen');

  // grundlag=forsikring → HELE psykiater-grenen skjules.
  await pick('input[name="grundlag"][value="forsikring"]');
  check(!(await vis('#block-henvisning')), 'forsikring: henvisning skjult');
  check(!(await vis('#block-tilbudt')),    'forsikring: forloeb_tilbudt skjult');
  check(!(await vis('#block-tid')),        'forsikring: tid skjult');
  await shot('anmod-v21-forsikring.png');

  // Udfyld alt UNDTAGEN telefon (S1: telefon er nu PÅKRÆVET).
  await page.fill('#in-fornavn', 'Syntetisk');
  await page.fill('#in-efternavn', 'Testperson');
  await pick('input[name="grundlag"][value="psykiater"]');
  await pick('input[name="henvisning_psykiater"][value="vestegnsklinikken"]');
  await pick('input[name="forloeb_tilbudt"][value="gruppe"]');
  await pick('input[name="tid_dage"][value="tirsdag"]');
  await pick('input[name="tid_tider"][value="14:00"]');
  await pick('#in-atten');
  await pick('#in-samtykke');

  // S1 fail-loud: submit UDEN telefon → fejl-besked, kvittering vises IKKE.
  await page.click('#send-btn');
  await page.waitForFunction(() => document.getElementById('form-error').textContent.trim().length > 0, null, { timeout: 4000 });
  check(!(await vis('#screen-done')), 'telefon mangler: kvittering vises IKKE (fail-loud)');
  check(/telefon/i.test(await page.locator('#form-error').textContent()), 'telefon mangler: fejl-besked nævner telefon');
  await shot('anmod-v21-telefon-paakraevet.png');

  // Udfyld telefon (PÅKRÆVET) + email (valgfri) → submit → kvittering.
  await page.fill('#in-telefon', '12 34 56 78');
  await page.fill('#in-email', 'syntetisk@eksempel.invalid');
  await page.click('#send-btn');
  await page.waitForSelector('#screen-done.active', { timeout: 8000 });
  check(true, 'submit m. telefon bygger+krypterer konvolut → kvitteringsskærm aktiv');
  await shot('anmod-v21-kvittering.png');

  check(pageErrors.length === 0, 'ingen JS-fejl gennem hele flowet', pageErrors.join(' | '));
} catch (e) {
  check(false, 'smoke-flow kastede', String(e));
} finally {
  await browser.close();
  server.close();
}

console.log('');
if (fails > 0) { console.error(`ANMOD-SMOKE FAILED: ${fails} fejl`); process.exit(1); }
console.log('ANMOD-SMOKE PASSED');
