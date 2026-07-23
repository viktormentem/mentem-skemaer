// e2e-autosend.mjs — synthetic end-to-end for web-producent-benet (#1/#2/#4).
//
// NUL ægte PHI. Beviser to ting mod en LOKAL ingest-worker (D1-eu):
//   (AUTO)  ?...&it=<syntetisk token>&ingestpk=<syntetisk X25519>&ingestapi=<lokal worker>
//           → web krypterer baseline til INGEST-nøglen, POSTer /submit, status "sendt sikkert".
//           → /pending (svc-token) → ciphertext → Node-dekrypt m. syntetisk ingest-priv
//             → plaintext == det udfyldte (web→/submit→D1→pull→decrypt grøn).
//   (PROD)  samme side UDEN it= → autoSendEnabled=false → 0 POST + fil-fallback (download/del).
//           Beviser at prod-adfærd er byte-uændret uden et it=-link.
//
// Token-sig-nøgle = den syntetiske Ed25519 i ingest-worker/test/.synthetic-key.json (type
// 'syntetisk' → kan ALDRIG binde en rigtig klient, spec §8.7). Ingest-X25519-paret genereres
// FRISK i hukommelsen pr. kørsel (ingen fil). Forudsætter en kørende worker (run-autosend-e2e.sh).
//
//   node test/e2e-autosend.mjs        (kør via run-autosend-e2e.sh som starter worker)
//
// Env (alle har fornuftige defaults):
//   WORKER_BASE   default http://127.0.0.1:8787
//   SVC_TOKEN     default dev-service-token-SYNTHETIC
//   SYNTH_KEYFILE default <D1-eu-worktree>/ingest-worker/test/.synthetic-key.json
//   PW_DIR        default <PsykologInvitation>/e2e/playwright/node_modules

import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SITE_DIR    = path.resolve(fileURLToPath(new URL('../', import.meta.url)));   // mentem-skemaer/
const WORKER_BASE = (process.env.WORKER_BASE || 'http://127.0.0.1:8787').replace(/\/+$/, '');
const SVC_TOKEN   = process.env.SVC_TOKEN || 'dev-service-token-SYNTHETIC';
const SYNTH_KEYFILE = process.env.SYNTH_KEYFILE
  || '/private/tmp/wt-ingest-d1-eu/ingest-worker/test/.synthetic-key.json';
const PW_DIR = process.env.PW_DIR
  || '/Users/viktornielsen/Documents/MEMTEM/PsykologInvitation/e2e/playwright/node_modules';

let fails = 0;
const log = (...a) => console.log(...a);
function check(cond, label, extra = '') { if (cond) log('  OK ', label); else { log('  XX ', label, extra); fails++; } }

// ── 1. Mønt syntetisk it=-token (Ed25519, matcher worker .dev.vars INGEST_TOKEN_PUBKEY) ──
if (!fs.existsSync(SYNTH_KEYFILE)) {
  console.error('Mangler syntetisk token-nøgle:', SYNTH_KEYFILE, '\nKør `npm run gen-key` i ingest-worker først.');
  process.exit(2);
}
const synth = JSON.parse(fs.readFileSync(SYNTH_KEYFILE, 'utf8'));
const tokenPriv = crypto.createPrivateKey({ key: synth.privJwk, format: 'jwk' });
const b64url = (buf) => Buffer.from(buf).toString('base64url');
function mintToken({ pseudonymID, exp, scope }) {
  const scopeB64 = b64url(JSON.stringify(scope));
  const msg = `v1.${pseudonymID}.${exp}.${scopeB64}`;
  const sig = crypto.sign(null, Buffer.from(msg), tokenPriv);   // Ed25519
  return `${msg}.${b64url(sig)}`;
}
const pseudonymID = 'SYN-e2e-' + crypto.randomUUID();
const exp = Math.floor(Date.now() / 1000) + 3600;
const scope = { t: 'syntetisk', s: 'soevn-baseline', d: 14, max: 20 };
const itToken = mintToken({ pseudonymID, exp, scope });

// ── 2. Frisk syntetisk INGEST X25519-par (recipient) ──
const ingestKp = crypto.generateKeyPairSync('x25519');
const ingestPubRaw = ingestKp.publicKey.export({ type: 'spki', format: 'der' }).slice(-32);
const ingestPubB64url = Buffer.from(ingestPubRaw).toString('base64url');

// Node-decrypt af mentemEncrypt-containeren (X25519 → HKDF-SHA256 → AES-256-GCM).
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

// ── 3. Lokal statisk http-server (origin 127.0.0.1 → TEST_HOST true → ?ingestpk/?ingestapi aktiv) ──
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

// Fælles baseline-udfyldning (generisk over felt-typerne; substans = valgfri → springes).
async function udfyldBaselineOgSend(page) {
  // GDPR-register 1.6 (Viktor 16/7): baseline i forløb = behandlingsdata (grundlag 9(2)(h) jf.
  // 9(3) + §7 stk. 3). INGEN samtykke-gate. E2E BEVISER at Start er åben uden samtykke-handling.
  await page.waitForSelector('#baseline-start-btn');
  check(!(await page.$eval('#baseline-start-btn', (b) => b.disabled)),
    'register 1.6: Start ÅBEN uden samtykke-handling', 'baseline-start-btn.disabled');
  check(await page.$('#baseline-consent-cb') === null,
    'register 1.3: INGEN samtykke-checkbox på baseline');
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
  // baseline-done har INTET navnefelt (#patient-name hører til batteri-formularen) →
  // fyld kun hvis synligt; baseline-clientName forbliver tom (round-trip af '').
  const nameEl = await page.$('#patient-name');
  if (nameEl && await nameEl.isVisible()) await nameEl.fill('SYN Testperson');
  await page.click('#share-btn');
}

let chromium;
try { ({ chromium } = await import(path.join(PW_DIR, 'playwright', 'index.mjs'))); }
catch { ({ chromium } = (await import(path.join(PW_DIR, 'playwright', 'index.js'))).default); }

const SHOT_DIR = process.env.SHOT_DIR || '';   // sat → gem See-it-screenshots af begge tilstande
async function shot(page, name) { if (SHOT_DIR) { try { await page.screenshot({ path: path.join(SHOT_DIR, name), fullPage: true }); log('   shot ->', name); } catch {} } }

const browser = await chromium.launch({ headless: true });
log(`\nmentem auto-send synthetic E2E`);
log(`site=${SITE}  worker=${WORKER_BASE}  pseudonym=${pseudonymID}\n`);

// ── 4a. PROD-UÆNDRET: UDEN it= → 0 POST + fil-fallback ──
{
  const ctx = await browser.newContext({ acceptDownloads: true });
  const page = await ctx.newPage();
  let posts = 0;
  page.on('request', (r) => { if (r.method() === 'POST') posts++; });
  page.on('download', (d) => { d.path().catch(() => {}); });   // slug auto-download
  await page.goto(`${SITE}/?s=soevn-baseline`, { waitUntil: 'load' });
  await udfyldBaselineOgSend(page);
  // fil-fallback: visFilFallbackUI rendrer "Hent filen igen"-anker + "Filen er klar".
  await page.waitForFunction(() => {
    const s = document.getElementById('done-status');
    return s && /Filen er klar|Hent filen/i.test(s.textContent || s.innerHTML || '');
  }, { timeout: 8000 }).catch(() => {});
  const statusTxt = await page.$eval('#done-status', (e) => e.textContent || '');
  const hasDl = await page.$eval('#done-status', (e) => !!e.querySelector('a[download]'));
  await shot(page, 'autosend-PROD-fallback-uden-it.png');
  check(posts === 0, 'PROD (uden it=): 0 POST affyret (prod-adfærd uændret)', `posts=${posts}`);
  check(hasDl, 'PROD: fil-fallback rendrer download-anker (download/del-sti)', statusTxt.slice(0, 60));
  check(!/sendt sikkert/i.test(statusTxt), 'PROD: status nævner IKKE auto-send', statusTxt.slice(0, 60));
  await ctx.close();
}

// ── 4b. AUTO-SEND: MED it= → POST /submit + "sendt sikkert" ──
let autoStatus = '';
{
  const ctx = await browser.newContext({ acceptDownloads: true });
  const page = await ctx.newPage();
  let submitPosts = 0;
  page.on('request', (r) => { if (r.method() === 'POST' && r.url().includes('/submit')) submitPosts++; });
  const url = `${SITE}/?s=soevn-baseline&it=${encodeURIComponent(itToken)}`
    + `&ingestpk=${encodeURIComponent(ingestPubB64url)}&ingestapi=${encodeURIComponent(WORKER_BASE)}`;
  await page.goto(url, { waitUntil: 'load' });
  await udfyldBaselineOgSend(page);
  await page.waitForFunction(() => {
    const s = document.getElementById('done-status');
    return s && /sendt sikkert og krypteret/i.test(s.textContent || '');
  }, { timeout: 10000 }).catch(() => {});
  autoStatus = await page.$eval('#done-status', (e) => e.textContent || '');
  await shot(page, 'autosend-AUTO-sendt-sikkert-med-it.png');
  check(submitPosts >= 1, 'AUTO (med it=): POST /submit affyret', `submitPosts=${submitPosts}`);
  check(/sendt sikkert og krypteret/i.test(autoStatus), 'AUTO: status = "sendt sikkert og krypteret"', autoStatus.slice(0, 70));
  await ctx.close();
}

await browser.close();
server.close();

// ── 5. /pending (svc) → ciphertext → Node-decrypt m. ingest-priv → assert plaintext ──
const pend = await fetch(`${WORKER_BASE}/pending`, { headers: { 'X-Mentem-Service-Token': SVC_TOKEN } });
const pj = await pend.json().catch(() => ({}));
const rec = (pj.pending || []).find((x) => x.pseudonymID === pseudonymID);
check(pend.status === 200 && !!rec, 'PULL: submission synlig i /pending for vores pseudonym', JSON.stringify({ status: pend.status, count: pj.count }));
check(!!rec && rec.schemaType === 'soevn-baseline', 'PULL: schemaType = soevn-baseline', rec && rec.schemaType);
check(!!rec && rec.tokenType === 'syntetisk', 'PULL: tokenType = syntetisk (kan ej binde rigtig klient)', rec && rec.tokenType);

let plain = null;
if (rec) {
  try {
    const container = JSON.parse(rec.ciphertext);
    // INGEST_KEY_ID = 2af28306 (index.html:537 / anmod.html:257 / soevn-screening-smoke.mjs:137):
    // foerste 8 hex af SHA-256(raa ingest-pubkey). Var 'cce9b373' da denne E2E blev skrevet (83aa7ad,
    // 2026-06-18); ingest-pubkey blev siden roteret -> stale fixture opdateret til den kanoniske vaerdi.
    check(container.keyId === '2af28306', 'DECRYPT: container stemplet med INGEST-keyId (2af28306)', container.keyId);
    check(container.keyId !== '8aa536a1', 'DECRYPT: IKKE journal-nøglen 8aa536a1 (separat-ingest-nøgle-kontrakt)', container.keyId);
    plain = decryptContainer(container, ingestKp.privateKey);
  } catch (e) { check(false, 'DECRYPT: konvolut dekrypterbar m. syntetisk ingest-priv', e.message); }
}
if (plain) {
  check(Array.isArray(plain.categories) && plain.categories.includes('soevn-baseline'), 'DECRYPT: payload.categories = [soevn-baseline]', JSON.stringify(plain.categories));
  check(plain.therapistName === 'Viktor Nielsen', 'DECRYPT: therapistName bevaret', plain.therapistName);
  check(plain.baseline && plain.baseline.alder === 42, 'DECRYPT: udfyldt baseline.alder == 42 (web→submit→D1→pull→decrypt grøn)', JSON.stringify(plain.baseline));
  check(typeof plain.baseline.vanligOpvaagning === 'string' && plain.baseline.vanligOpvaagning === '07:00', 'DECRYPT: time-felt vanligOpvaagning == 07:00 round-trip', plain.baseline && plain.baseline.vanligOpvaagning);
  check(plain.clientName === '', 'DECRYPT: clientName tom (baseline har ingen navne-felt) round-trip', JSON.stringify(plain.clientName));
  check(plain.baselineType === 'soevn-intake', 'DECRYPT: baselineType = soevn-intake', plain.baselineType);
}

log('\n' + (fails === 0 ? 'ALL GREEN (auto-send + prod-uændret + crypto round-trip)' : fails + ' FAIL'));
process.exit(fails === 0 ? 0 : 1);
