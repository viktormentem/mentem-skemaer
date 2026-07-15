// e2e-besked-fase-b.mjs — self-contained runtime-smoke for besked-track FASE B (K3+K4).
//
// NUL ægte PHI, INGEN worker nødvendig. autoSendEnabled() gater KUN på token-REGEX
// (signaturen valideres server-side af workeren) → vi mønter et regex-gyldigt FAKE
// it=-token og INTERCEPTER POST /submit i Playwright (fulfill {status:'received'}).
// Beviser LIVE i den rigtige index.html:
//   (AUTO)  ?s=soevn-baseline&it=<fake>&ingestpk=<frisk X25519>&ingestapi=<any>
//           → K4: send-knappen viser "Send sikkert" (auto-send-sti sand)
//           → K3: kvitteringen = den ene fælles primære "Dine svar er sendt sikkert
//                 og krypteret til din psykolog. Tak!" (genbrugelig komponent)
//   (PROD)  samme side UDEN it= → autoSendEnabled=false
//           → K4: knappen viser den beskrivende fallback "Send filen til din psykolog",
//                 IKKE "Send sikkert" (nordstjerne-ærlighed: "sikkert" kun når det er sandt)
//   + zero console-errors (beviser at nye imports/funktioner i modulet er gyldige).
//
//   node test/e2e-besked-fase-b.mjs            (SHOT_DIR=<dir> → gem See-it-screenshots)

import crypto from 'node:crypto';
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

// ── Fake it=-token: matcher autoSendEnabled-regex /^v1\.[^.]+\.\d+\.[^.]+\.[^.]+$/ ──
const exp = Math.floor(Date.now() / 1000) + 3600;
const fakeToken = `v1.SYN-faseb.${exp}.eyJ0IjoieCJ9.AAAA`;
// Frisk syntetisk INGEST X25519-par (recipient) → mentemEncrypt lykkes klient-side.
const ingestKp = crypto.generateKeyPairSync('x25519');
const ingestPubRaw = ingestKp.publicKey.export({ type: 'spki', format: 'der' }).slice(-32);
const ingestPubB64url = Buffer.from(ingestPubRaw).toString('base64url');

// ── Lokal statisk http-server (origin 127.0.0.1 → TEST_HOST → ?ingestpk/?ingestapi aktiv) ──
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
const PORT = server.address().port;
const SITE = `http://127.0.0.1:${PORT}`;

async function udfyldBaseline(page) {
  await page.waitForSelector('#baseline-consent-cb');
  await page.check('#baseline-consent-cb');
  await page.waitForSelector('#baseline-start-btn:not([disabled])');
  await page.click('#baseline-start-btn');
  await page.waitForSelector('#baseline-fields input, #baseline-fields .radio-option');
  await page.evaluate(() => {
    const seen = new Set();
    document.querySelectorAll('#baseline-fields input[type=radio]').forEach((r) => {
      if (!seen.has(r.name)) { seen.add(r.name); r.checked = true; r.dispatchEvent(new Event('change', { bubbles: true })); }
    });
    document.querySelectorAll('#baseline-fields input[type=number]').forEach((n) => { n.value = '42'; n.dispatchEvent(new Event('input', { bubbles: true })); });
    document.querySelectorAll('#baseline-fields input[type=time]').forEach((t) => { t.value = '07:00'; t.dispatchEvent(new Event('input', { bubbles: true })); });
  });
  await page.waitForSelector('#baseline-finish-btn:not([disabled])');
  await page.click('#baseline-finish-btn');
  await page.waitForSelector('#screen-done.active');
}

let chromium;
try { ({ chromium } = await import(path.join(PW_DIR, 'playwright', 'index.mjs'))); }
catch { ({ chromium } = (await import(path.join(PW_DIR, 'playwright', 'index.js'))).default); }
async function shot(page, name) { if (SHOT_DIR) { try { await page.screenshot({ path: path.join(SHOT_DIR, name), fullPage: true }); log('   shot ->', name); } catch {} } }

const browser = await chromium.launch({ headless: true });
log('\nbesked-track FASE B (K3+K4) runtime-smoke');
log(`site=${SITE}\n`);
const consoleErrors = [];

// ── AUTO: MED it= → "Send sikkert"-knap + fælles kvittering ──
{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push('AUTO: ' + m.text()); });
  page.on('pageerror', (e) => consoleErrors.push('AUTO pageerror: ' + e.message));
  // INTERCEPT /submit → simulér worker-accept (ingen ægte worker).
  await page.route('**/submit', (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'received' }) }));
  const url = `${SITE}/?s=soevn-baseline&it=${encodeURIComponent(fakeToken)}`
    + `&ingestpk=${ingestPubB64url}&ingestapi=${encodeURIComponent(SITE)}`;
  await page.goto(url, { waitUntil: 'load' });
  await udfyldBaseline(page);
  const cta = await page.$eval('#share-btn', (b) => b.textContent.trim());
  check(cta === 'Send sikkert', 'K4 AUTO: send-knap = "Send sikkert"', `fik "${cta}"`);
  await shot(page, 'faseb-auto-cta-send-sikkert.png');
  await page.click('#share-btn');
  await page.waitForFunction(() => {
    const s = document.getElementById('done-status');
    return s && /sendt sikkert og krypteret/i.test(s.textContent || '');
  }, { timeout: 8000 });
  const receipt = await page.$eval('#done-status', (e) => e.textContent.trim());
  check(receipt === 'Dine svar er sendt sikkert og krypteret til din psykolog. Tak!',
    'K3 AUTO: fælles primær kvittering ("din psykolog", ingen tal)', `fik "${receipt}"`);
  check(!/[0-9]/.test(receipt), 'K3 AUTO: kvittering nævner ingen tal', receipt);
  await shot(page, 'faseb-auto-kvittering.png');
  await ctx.close();
}

// ── PROD: UDEN it= → fallback-knap, IKKE "Send sikkert" ──
{
  const ctx = await browser.newContext({ acceptDownloads: true });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push('PROD: ' + m.text()); });
  page.on('pageerror', (e) => consoleErrors.push('PROD pageerror: ' + e.message));
  page.on('download', (d) => { d.path().catch(() => {}); });
  await page.goto(`${SITE}/?s=soevn-baseline`, { waitUntil: 'load' });
  await udfyldBaseline(page);
  const cta = await page.$eval('#share-btn', (b) => b.textContent.trim());
  check(cta !== 'Send sikkert', 'K4 PROD: knap er IKKE "Send sikkert" uden auto-send', `fik "${cta}"`);
  check(cta === 'Send filen til din psykolog', 'K4 PROD: beskrivende fallback-tekst', `fik "${cta}"`);
  await shot(page, 'faseb-prod-fallback-cta.png');
  await ctx.close();
}

check(consoleErrors.length === 0, 'ZERO console-errors i begge kørsler (modul gyldigt)', consoleErrors.join(' | '));

await browser.close();
server.close();
log('');
if (fails > 0) { console.error(`FASE B SMOKE FAILED: ${fails} fejl`); process.exit(1); }
log('FASE B SMOKE PASSED'); process.exit(0);
