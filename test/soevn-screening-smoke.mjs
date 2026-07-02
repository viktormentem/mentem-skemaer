// soevn-screening-smoke.mjs — chromium E2E-smoke af soevn-screening-flowet (Fase C §3a).
//
// Verificerer i en ÆGTE browser (headless chromium via playwright):
//   1. ?s=soevn-screening&t=<v1-token> loader uden JS-fejl; v1-token i &t= aktiverer
//      auto-send (Fase C-kontrakten: Mentems opstarts-link bærer v1-tokenet i &t=).
//   2. Ét-spørgsmål-ad-gangen-stepperen kører (6 anamnese + 8 STOP-Bang + valgfri
//      fritekst), "Ved ikke" findes KUN på halsomfang, submit gated på 14/14.
//   3. Review-skærm viser alle svar + Ret-knapper.
//   4. FULD WIRE-BEVIS: send → POST /submit fanges lokalt → containeren dekrypteres
//      (syntetisk X25519-recipient via ?ingestpk, kun TEST_HOST) → data.screeningSvar
//      matcher BYTE-FORMEN fra Mentem-facit (SoevnFaseCTests.testScreeningSvarPayload-
//      Roundtrip) + token på wiren == &t=-tokenet (t→ingest-wiring bevist E2E).
//
// Kør: node test/soevn-screening-smoke.mjs   (exit 0 = grøn)
//      SHOT_DIR=<dir> gemmer See-it-screenshots pr. hovedskærm.

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const SITE_DIR = path.resolve(fileURLToPath(new URL('../', import.meta.url)));   // mentem-skemaer/
const PW_DIR = process.env.PW_DIR
  || '/Users/viktornielsen/Documents/MEMTEM/PsykologInvitation/e2e/playwright/node_modules';
const SHOT_DIR = process.env.SHOT_DIR || '';

let fails = 0;
const log = (...a) => console.log(...a);
function check(cond, label, extra = '') { if (cond) log('  OK ', label); else { log('  XX ', label, extra); fails++; } }

// ── FACIT (verbatim fra SoevnFaseCTests.testScreeningSvarPayloadRoundtrip) ──
const FACIT_SCREENING_SVAR = {
  stopBang: {
    snorken: true, observeretApnoe: false, dagtraethed: true, hypertension: false,
    bmiOver35: false, alderOver50: true, halsomfangOver40: null, koenMand: false,
  },
  kontraindikationer: ['parasomnier'],
  fritekst: 'Jeg går nogle gange i søvne.',
};

// ── 1. Syntetisk v1-token i &t= (format-gyldig; lokal server auth'er ikke) ──
const b64url = (b) => Buffer.from(b).toString('base64url');
const scopeB64 = b64url(JSON.stringify({ t: 'syntetisk', s: 'soevn-screening', d: 14, max: 21 }));
const exp = Math.floor(Date.now() / 1000) + 3600;
const tToken = `v1.SYN-scr-smoke.${exp}.${scopeB64}.${b64url('syntetisk-signatur')}`;

// ── 2. Syntetisk INGEST X25519-par (recipient via ?ingestpk, kun TEST_HOST) ──
const ingestKp = crypto.generateKeyPairSync('x25519');
const ingestPubRaw = ingestKp.publicKey.export({ type: 'spki', format: 'der' }).slice(-32);
const ingestPubB64url = Buffer.from(ingestPubRaw).toString('base64url');

function rawToX25519Pub(raw32) {
  const prefix = Buffer.from('302a300506032b656e032100', 'hex');   // SPKI DER-prefix for X25519
  return crypto.createPublicKey({ key: Buffer.concat([prefix, Buffer.from(raw32)]), format: 'der', type: 'spki' });
}
function decryptContainer(c, priv) {
  const std = (s) => Buffer.from(s, 'base64');   // bytesToB64 = standard base64
  const ephPub = rawToX25519Pub(std(c.ephemeralPublicKey));
  const shared = crypto.diffieHellman({ privateKey: priv, publicKey: ephPub });   // 32B
  const keyBuf = Buffer.from(crypto.hkdfSync('sha256', shared, std(c.salt),
    Buffer.from('TherapyCopilot-E2E-Export-v1'), 32));
  const dec = crypto.createDecipheriv('aes-256-gcm', keyBuf, std(c.nonce));
  dec.setAuthTag(std(c.tag));
  return JSON.parse(Buffer.concat([dec.update(std(c.encryptedData)), dec.final()]).toString('utf8'));
}

// ── 3. Lokal server: statiske filer + POST /submit-fangst (127.0.0.1 → TEST_HOST) ──
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json' };
let capturedSubmit = null;
const server = http.createServer((req, res) => {
  if (req.method === 'POST' && req.url.split('?')[0] === '/submit') {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      try { capturedSubmit = JSON.parse(body); } catch { capturedSubmit = { parseError: body.slice(0, 200) }; }
      res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
      res.end(JSON.stringify({ status: 'received' }));
    });
    return;
  }
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

const pageErrors = [];
const erRessourceFejl = (s) => /Failed to load resource|net::ERR/i.test(s);
page.on('pageerror', (e) => pageErrors.push(String(e)));
page.on('console', (m) => {
  if (m.type() !== 'error') return;
  const t = 'console.error: ' + m.text();
  if (!erRessourceFejl(t)) pageErrors.push(t);
});

// Settle-vent før capture: .screen-fade-in-transitionen skal være færdig, ellers
// er See-it-evidensen udvasket (kun screenshots; asserts venter på selektorer).
async function shot(name) { if (SHOT_DIR) { try { await page.waitForTimeout(600); await page.screenshot({ path: path.join(SHOT_DIR, name), fullPage: true }); log('   shot ->', name); } catch {} } }

// Besvar det AKTIVE trin (radio-id #scr-<key>-<ja|nej|vedikke>) og vent på auto-frem.
async function svarTrin(key, enc) {
  const sel = `#scr-${key}-${enc}`;
  await page.waitForSelector(sel, { state: 'visible', timeout: 6000 });
  await page.check(sel);
}

try {
  const url = `${SITE}/?s=soevn-screening&t=${encodeURIComponent(tToken)}`
    + `&ingestpk=${ingestPubB64url}&ingestapi=${encodeURIComponent(SITE)}`;
  console.log('soevn-screening chromium-smoke:', url);
  await page.goto(url, { waitUntil: 'load' });

  // ── Velkomst ──
  await page.waitForSelector('#screen-screening-welcome.active', { timeout: 8000 });
  check(pageErrors.length === 0, 'loader uden JS-/console-fejl', pageErrors.join(' | '));
  check((await page.locator('#screening-intro').textContent()).includes('sikkerhedsskema') === false
    ? (await page.locator('#screening-intro').textContent()).length > 40
    : true, 'velkomst-intro renderet');
  const fp = await page.locator('#screening-key-fp').textContent();
  check(/2af28306/.test(fp), 'fingeraftryk viser INGEST-nøgle-id (auto-send via &t= v1-token)', fp);
  const disc = await page.locator('#screen-screening-welcome .disc-body').innerHTML();
  check(/direkte til din psykolog/.test(disc), 'privatlivstekst flippet til auto-send-variant (t=v1 aktiverer)', disc.slice(0, 80));
  await shot('screening-1-velkomst.png');

  // ── Stepper: 6 anamnese + 8 STOP-Bang (facit-svar) ──
  await page.click('#screening-start-btn');
  await page.waitForSelector('#screen-instrument.active', { timeout: 6000 });
  await page.waitForSelector('#a11y-step-head', { timeout: 6000 });
  const head0 = await page.locator('#a11y-step-head').textContent();
  check(/Spørgsmål 1 af 15/.test(head0), 'stepper aktiv: Spørgsmål 1 af 15', head0);
  check(!(await page.locator('#instrument-submit').isVisible()), 'submit skjult før sidste trin');
  await shot('screening-2-spoergsmaal1.png');

  await svarTrin('bipolarMani', 'nej');
  await svarTrin('epilepsiAnfald', 'nej');
  await svarTrin('parasomnier', 'ja');
  await svarTrin('betydeligFaldrisiko', 'nej');
  await svarTrin('erhvervschauffoer', 'nej');
  await svarTrin('natarbejde', 'nej');
  await svarTrin('snorken', 'ja');
  await svarTrin('observeretApnoe', 'nej');
  await svarTrin('dagtraethed', 'ja');
  await svarTrin('hypertension', 'nej');
  await svarTrin('bmiOver35', 'nej');
  await svarTrin('alderOver50', 'ja');
  // Halsomfang: "Ved ikke" (kontrakt: null — aldrig et tavst nej).
  await page.waitForSelector('#scr-halsomfangOver40-vedikke', { state: 'visible', timeout: 6000 });
  check(await page.locator('#scr-halsomfangOver40-vedikke').count() === 1, 'halsomfang HAR Ved ikke-mulighed');
  check(await page.locator('#scr-snorken-vedikke').count() === 0, 'andre STOP-Bang-items har IKKE Ved ikke');
  await shot('screening-3-halsomfang-vedikke.png');
  await svarTrin('halsomfangOver40', 'vedikke');
  await svarTrin('koenMand', 'nej');

  // ── Fritekst (sidste trin, valgfri) + submit-gate ──
  await page.waitForSelector('#instrument-fields textarea', { state: 'visible', timeout: 6000 });
  await page.waitForSelector('#instrument-submit:not([disabled])', { timeout: 6000 });
  check(true, 'submit ENABLED ved 14/14 besvarede');
  const prog = await page.locator('#instrument-progress-current').textContent();
  check(/14 af 14/.test(prog), 'fremdrift viser 14 af 14', prog);
  await page.fill('#instrument-fields textarea', 'Jeg går nogle gange i søvne.');
  await shot('screening-4-fritekst-submit.png');

  // ── Review ──
  await page.click('#instrument-submit');
  await page.waitForSelector('#screen-instrument-review.active', { timeout: 6000 });
  const rows = await page.locator('.instrument-review-row').count();
  check(rows === 15, 'review viser 15 rækker (14 items + fritekst)', String(rows));
  const reviewTekst = await page.locator('#instrument-review-list').textContent();
  check(/Ved ikke/.test(reviewTekst), 'review viser Ved ikke-svaret');
  check(/Jeg går nogle gange i søvne\./.test(reviewTekst), 'review viser fritekst');
  await shot('screening-5-review.png');

  // ── Send: POST fanges lokalt → dekryptér → BYTE-FACIT ──
  await page.click('#instrument-review-submit');
  await page.waitForSelector('#screen-done.active', { timeout: 6000 });
  await shot('screening-6-klar-til-send.png');
  await page.click('#share-btn');
  await page.waitForFunction(() => /sendt sikkert/.test(document.getElementById('done-status').textContent), null, { timeout: 10000 });
  check(true, 'auto-send: "sendt sikkert"-kvittering vist');
  await shot('screening-7-sendt.png');

  check(!!capturedSubmit && !capturedSubmit.parseError, 'POST /submit fanget lokalt');
  if (capturedSubmit && !capturedSubmit.parseError) {
    check(capturedSubmit.token === tToken, 'wire-token == &t=-tokenet (t→ingest-wiring bevist E2E)');
    check(capturedSubmit.schemaType === 'soevn-screening', 'wire schemaType = soevn-screening', capturedSubmit.schemaType);
    const container = JSON.parse(capturedSubmit.ciphertext);
    check(container.formatIdentifier === 'therapy-copilot-encrypted-export', 'containerformat uændret');
    const konvolut = decryptContainer(container, ingestKp.privateKey);
    check(konvolut.schemaType === 'soevn-screening', 'dekrypteret konvolut.schemaType = soevn-screening');
    check(konvolut.clientUA === 'web', 'dekrypteret konvolut.clientUA = web');
    const got = JSON.stringify(konvolut.data.screeningSvar);
    const want = JSON.stringify(FACIT_SCREENING_SVAR);
    check(got === want, 'DEKRYPTERET data.screeningSvar == Mentem-facit (byte-form)', `got ${got}`);
  }

  check(pageErrors.length === 0, 'ingen JS-fejl gennem hele flowet', pageErrors.join(' | '));
} catch (e) {
  check(false, 'smoke-flow kastede', String(e));
  await shot('screening-FEJL.png');
} finally {
  await browser.close();
  server.close();
}

console.log('');
if (fails > 0) { console.error(`SOEVN-SCREENING-SMOKE FAILED: ${fails} fejl`); process.exit(1); }
console.log('SOEVN-SCREENING-SMOKE PASSED');
