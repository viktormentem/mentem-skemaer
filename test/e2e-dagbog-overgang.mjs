// e2e-dagbog-overgang.mjs — runtime-bevis for at et IGANGVAERENDE forloeb aldrig naar serveren.
//
// HVORFOR DEN FINDES (14/8). Der er EEN index.html paa EEN host. Naar `LOCAL_ONLY` en dag
// vendes, rammer det ogsaa klienter der er MIDT i et forloeb. Og `pushDraft()` sender HELE
// den akkumulerede dagbog, ikke kun den nye dag:
//
//     »Krypter HELE den akkumulerede dagbog -> PUT«   (index.html, pushDraft)
//
// En klient paa dag 10 der siger ja, ville derfor sende ti dage, hvoraf de ni blev skrevet
// under den tekst hun faktisk fik at laese: **»De sendes ikke nogen steder undervejs.«**
// Det er ikke en fejl i PUT'en. Det er den rigtige adfaerd anvendt paa den forkerte kohorte.
//
// MAALT 14/8 i `MentemSoevnForloeb` (UserDefaults, ikke-PII): 2 dagbogs-forloeb er stadig
// inden for deres periode, begge startet 24-07-2026, begge 90 dage, begge slut 22-10-2026.
// Denne proeve kan derfor SLETTES efter 22-10-2026, sammen med selve overgangsleddet.
//
// 🔴 DEN AFGOERENDE EGENSKAB: et foer-cutover-forloeb maa hverken PUT'e, GET'e eller faa
//    VIST et samtykke. At skjule knappen er ikke nok; at lukke fetch-vejen er ikke nok.
//    Begge maales her.
//
// 🔴 OG POS-KTRL BAERER HELE PROEVEN: uden case B ville en side der aldrig kontakter nogen
//    server bestaa case A perfekt. Vi maaler foerst at server-vejen ER levende for et NYT
//    forloeb, og derefter at den er doed for det gamle. Ellers maaler vi ingenting.
//
//   node test/e2e-dagbog-overgang.mjs

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SITE_DIR = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
const PW_DIR = process.env.PW_DIR
  || '/Users/viktornielsen/Documents/MEMTEM/PsykologInvitation/e2e/playwright/node_modules';

let fails = 0;
const log = (...a) => console.log(...a);
function check(cond, label, extra = '') { if (cond) log('  OK ', label); else { log('  XX ', label, extra); fails++; } }

let seen = { PUT: 0, GET: 0, DELETE: 0 };
const nulstilTaeller = () => { seen = { PUT: 0, GET: 0, DELETE: 0 }; };

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  const p = decodeURIComponent(req.url.split('?')[0]);
  if (p.startsWith('/api/soevn-draft/')) {
    seen[req.method] = (seen[req.method] || 0) + 1;
    res.writeHead(200, { 'content-type': 'application/json' }); res.end(req.method === 'GET' ? '' : '{}');
    return;
  }
  const fp = path.join(SITE_DIR, path.normalize(p === '/' ? '/index.html' : p));
  if (!fp.startsWith(SITE_DIR) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { res.writeHead(404); res.end('nf'); return; }
  let body = fs.readFileSync(fp);
  if (fp.endsWith('index.html')) {
    const src = body.toString('utf8');
    // Vi vender hovedafbryderen, praecis som den dag den vendes i prod. Hele pointen er at
    // forloebs-gaten SKAL holde ogsaa naar det globale flag er aabent.
    const flipped = src.replace('const LOCAL_ONLY = true;', 'const LOCAL_ONLY = false;');
    if (flipped === src) { console.error('FATAL: LOCAL_ONLY-ankeret findes ikke — proeven ville teste den doede sti.'); process.exit(1); }
    body = Buffer.from(flipped, 'utf8');
  }
  res.writeHead(200, { 'content-type': MIME[path.extname(fp)] || 'application/octet-stream' });
  res.end(body);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const SITE = `http://127.0.0.1:${server.address().port}`;

let chromium;
try { ({ chromium } = await import(path.join(PW_DIR, 'playwright', 'index.mjs'))); }
catch { ({ chromium } = (await import(path.join(PW_DIR, 'playwright', 'index.js'))).default); }
const browser = await chromium.launch({ headless: true });

const LS = 'mentem_csd_v1';
const PERIODE = 90;

async function koer({ navn, seedState }) {
  nulstilTaeller();
  const ctx = await browser.newContext();
  if (seedState) {
    await ctx.addInitScript(([k, s]) => { localStorage.setItem(k, s); }, [LS, JSON.stringify(seedState)]);
  }
  const page = await ctx.newPage();
  const consoleErrors = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message));

  const tok = 'b'.repeat(32);
  await page.goto(`${SITE}/?s=soevndagbog&t=${tok}&d=${PERIODE}&api=${encodeURIComponent(SITE)}`, { waitUntil: 'load' });
  await page.waitForSelector('#screen-diary-welcome.active');

  const harSamtykke = await page.$('#diary-consent-cb') !== null;
  if (harSamtykke) await page.click('#diary-consent-cb');

  // Udfyld en dag, saa pushDraft() faar sin anledning.
  await page.click('#diary-start-btn');
  await page.waitForSelector('#diary-fields');
  await page.evaluate(() => {
    const set = new Set();
    document.querySelectorAll('#diary-fields input[type=radio]').forEach((r) => {
      if (!set.has(r.name)) { set.add(r.name); r.checked = true; r.dispatchEvent(new Event('change', { bubbles: true })); }
    });
    document.querySelectorAll('#diary-fields input[type=number]').forEach((n) => { n.value = '7'; n.dispatchEvent(new Event('input', { bubbles: true })); });
    document.querySelectorAll('#diary-fields input[type=time]').forEach((t) => { t.value = '07:00'; t.dispatchEvent(new Event('input', { bubbles: true })); });
  });
  await page.click('#diary-save-btn');
  await page.waitForSelector('#screen-diary-welcome.active');
  await page.waitForTimeout(400);   // fire-and-forget pushDraft()

  const dage = await page.evaluate((k) => (JSON.parse(localStorage.getItem(k) || '{}').entries || []).length, LS);
  const privTekst = await page.$eval('#diary-privacy', (e) => e.textContent.trim()).catch(() => '');
  await ctx.close();
  log(`  [${navn}] samtykke vist=${harSamtykke} · PUT=${seen.PUT} · GET=${seen.GET} · dage gemt=${dage} · console-fejl=${consoleErrors.length}`);
  return { harSamtykke, put: seen.PUT, get: seen.GET, dage, consoleErrors, privTekst };
}

log('\nsoevndagbog: overgangen — et igangvaerende forloeb naar aldrig serveren');
log(`site=${SITE} (LOCAL_ONLY=false-rewrite: den dag hovedafbryderen vendes)\n`);

// ── CASE B FOERST: POS-KTRL. Server-vejen SKAL vaere levende for et nyt forloeb ─────────
// Uden dette led maaler case A ingenting: en side der aldrig kontakter en server ville
// bestaa den perfekt.
const nyt = await koer({ navn: 'NYT forloeb (POS-KTRL)', seedState: null });
check(nyt.harSamtykke === true, 'POS-KTRL: nyt forloeb FAAR vist samtykket');
check(nyt.put >= 1, 'POS-KTRL: nyt forloeb PUT\'er til serveren', `PUT=${nyt.put}`);
check(nyt.dage === 1, 'POS-KTRL: nyt forloeb gemte sin dag', `dage=${nyt.dage}`);

// ── CASE A: den kohorte der skal skaermes ───────────────────────────────────────────────
// Formen er PRAECIS hvad en eksisterende klients localStorage indeholder i dag: en state
// UDEN `serverTilladt`, fordi feltet ikke fandtes da hun startede. Vi opdigter ikke et
// felt med vaerdien false; fravaeret ER tilstanden, og fail-safe skal ramme paa fravaeret.
const IGANG = {
  startedAt: '2026-07-24',          // maalt: begge igangvaerende dagbogs-forloeb startede her
  plannedDays: PERIODE,
  contentVersion: 1,
  dirty: false,
  entries: [{ date: '2026-07-25', savedAt: '2026-07-25T08:00:00.000Z' }],
};
const igang = await koer({ navn: 'IGANGVAERENDE forloeb', seedState: IGANG });
check(igang.harSamtykke === false, 'igangvaerende forloeb faar ALDRIG vist et samtykke');
check(igang.put === 0, 'igangvaerende forloeb PUT\'er ALDRIG', `PUT=${igang.put}`);
check(igang.get === 0, 'igangvaerende forloeb GET\'er ALDRIG (ingen resume-vej)', `GET=${igang.get}`);
check(igang.dage === 2, 'FITNESS: den gamle dag er bevaret OG den nye kunne gemmes', `dage=${igang.dage}`);
// 🔴 DEN DAG HOVEDAFBRYDEREN VENDES, MAA HUN IKKE MISTE SIN EGEN TEKST. En mutant afsloerede
//    at privatlivsteksten stadig branchede paa det globale flag: med LOCAL_ONLY=false gav
//    begge grene tom streng, saa den igangvaerende klient ville staa UDEN nogen privatlivs-
//    tekst overhovedet. At skaerme hendes DATA er ikke nok; hun skal ogsaa kunne se det
//    loefte hun sagde ja til.
check(/kun i denne browser/i.test(igang.privTekst),
  'den skaermede klient ser fortsat SIN egen v1-tekst (»kun i denne browser«)',
  `"${igang.privTekst.slice(0, 60)}"`);
check(!/kun i denne browser/i.test(nyt.privTekst),
  'NEG-KTRL: det nye forloeb ser IKKE v1-teksten (ellers matcher naalen bare altid)',
  `"${nyt.privTekst.slice(0, 60)}"`);
check(igang.consoleErrors.length === 0, 'ingen console-fejl paa den skaermede vej',
  igang.consoleErrors.join(' | '));

// ── NEG-KTRL paa selve seed-mekanismen ─────────────────────────────────────────────────
// Hvis addInitScript ikke virkede, ville case A i virkeligheden vaere endnu et NYT forloeb,
// og alle dens assertions ville vaere maalt paa den forkerte tilstand. Den gemte dag fra
// seed'en er beviset for at tilstanden faktisk blev laest.
check(igang.dage > nyt.dage, 'NEG-KTRL: seed\'en blev FAKTISK laest (2 dage mod 1)',
  `igang=${igang.dage} nyt=${nyt.dage}`);

// ── CASE C: et HELT NYT link med en TILBAGEDATERET aftalt start ─────────────────────────
// 🔴 Denne case findes fordi en mutant overlevede: foerste udgave af gaten sammenlignede
//    `startedAt` med en cutover-dato, og en tilbagedateret `?start=` ville da have givet
//    den lokale vej til en klient der aldrig har set nogen af teksterne. Skelnen skal
//    vaere »findes der allerede en state«, ikke »hvilken dato staar i linket«.
{
  nulstilTaeller();
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(`${SITE}/?s=soevndagbog&t=${'c'.repeat(32)}&d=${PERIODE}&start=2026-06-01&api=${encodeURIComponent(SITE)}`,
    { waitUntil: 'load' });
  await page.waitForSelector('#screen-diary-welcome.active');
  const vist = await page.$('#diary-consent-cb') !== null;
  // 🔴 STATEN PERSISTERES FOERST VED FOERSTE GEMNING. En laesning af localStorage FOER en dag
  //    er gemt, giver `undefined` for ALT, og en assertion paa den vaerdi ville maale
  //    »ikke gemt endnu« og kalde det »forkert vaerdi«. Foerste udgave af denne case gjorde
  //    netop det. Vi gemmer derfor en dag foerst.
  if (vist) await page.click('#diary-consent-cb');
  await page.click('#diary-start-btn');
  await page.waitForSelector('#diary-fields');
  await page.evaluate(() => {
    const set = new Set();
    document.querySelectorAll('#diary-fields input[type=radio]').forEach((r) => {
      if (!set.has(r.name)) { set.add(r.name); r.checked = true; r.dispatchEvent(new Event('change', { bubbles: true })); }
    });
    document.querySelectorAll('#diary-fields input[type=number]').forEach((n) => { n.value = '7'; n.dispatchEvent(new Event('input', { bubbles: true })); });
    document.querySelectorAll('#diary-fields input[type=time]').forEach((t) => { t.value = '07:00'; t.dispatchEvent(new Event('input', { bubbles: true })); });
  });
  await page.click('#diary-save-btn');
  await page.waitForSelector('#screen-diary-welcome.active');
  await page.waitForTimeout(400);
  const frosset = await page.evaluate((k) => JSON.parse(localStorage.getItem(k) || '{}').serverTilladt, LS);
  const start = await page.evaluate((k) => JSON.parse(localStorage.getItem(k) || '{}').startedAt, LS);
  await ctx.close();
  log(`  [NYT link, start=2026-06-01] samtykke vist=${vist} · serverTilladt=${frosset} · startedAt=${start}`);
  check(start === '2026-06-01', 'POS-KTRL: den tilbagedaterede start blev FAKTISK brugt', `startedAt=${start}`);
  check(frosset === true, 'nyt link med tilbagedateret start faar server-vejen (state-eksistens, ikke dato)');
  check(vist === true, 'og faar derfor ogsaa vist samtykket');
}

await browser.close();
server.close();
log(fails === 0 ? '\nE2E-DAGBOG-OVERGANG PASSED\n' : `\nE2E-DAGBOG-OVERGANG FAILED: ${fails} fejl\n`);
process.exit(fails === 0 ? 0 : 1);
