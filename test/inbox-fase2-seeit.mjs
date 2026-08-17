// See-it web-walk (chromium) af Fase 2 tovejs-inbox - klient-inbox lag 1.
// Driver den AEGTE flade i en browser: (1) enroll (inbox-enroll.html) saa custody + credential
// findes -> (2) laes enhedens pubkey fra IndexedDB -> (3) BEHANDLER seeder /outbox (mentemEncrypt
// til pubkey, service-token) -> (4) inbox-view.html autentificerer + dekrypterer + RENDERER traaden.
// Beviser at SIDENS JS laaser inboxen op lokalt + viser klarteksten. Dev/test-only, NUL klient-data.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { mentemEncrypt } from '../mentem-skema-core.js';
import { kraevWorkerEvne, kraevSyntetiskNoegle } from './_forudsaetning.mjs';

const SITE_DIR = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
const PW_DIR = process.env.PW_DIR || '/Users/viktornielsen/Documents/MEMTEM/PsykologInvitation/e2e/playwright/node_modules';
const API_BASE = process.env.API_BASE || 'http://127.0.0.1:8787';
const WORKER_DIR = process.env.WORKER_DIR || path.resolve(SITE_DIR, '../PsykologInvitation/ingest-worker');
const SHOT_DIR = process.env.SHOT_DIR || path.join(SITE_DIR, '.seeit-inbox-fase2');
const HOST = 'localhost', PORT = 5173;
fs.mkdirSync(SHOT_DIR, { recursive: true });

let fails = 0;
const log = (...a) => console.log(...a);
const check = (cond, label, extra = '') => { if (cond) log('  ✅', label); else { log('  ❌', label, extra); fails++; } };

// ── forudsaetninger FOER noget tungt startes (se test/_forudsaetning.mjs) ─────
// Fase 2 begynder med et enroll, saa den samme rute er ogsaa DENNE harness' forudsaetning.
await kraevWorkerEvne(API_BASE, '/webauthn/register/options', 'inbox-fase2-seeit', 'run-inbox-fase2-seeit.sh');
const keyFile = kraevSyntetiskNoegle(WORKER_DIR, 'inbox-fase2-seeit');

const synth = JSON.parse(fs.readFileSync(keyFile));
const tokenPriv = crypto.createPrivateKey({ key: synth.privJwk, format: 'jwk' });
const b64url = (buf) => Buffer.from(buf).toString('base64url');
const pseudonymID = 'SYN-' + crypto.randomUUID();
const exp = Math.floor(Date.now() / 1000) + 3600;
const scopeB64 = b64url(JSON.stringify({ t: 'individ', k: 'enroll' }));
const tokMsg = `v1.${pseudonymID}.${exp}.${scopeB64}`;
const ENROLL_TOKEN = `${tokMsg}.${b64url(crypto.sign(null, Buffer.from(tokMsg), tokenPriv))}`;
const SERVICE_TOKEN = (fs.readFileSync(path.join(WORKER_DIR, '.dev.vars'), 'utf8').match(/^SERVICE_TOKEN=(.*)$/m) || [])[1].trim().replace(/^["']|["']$/g, '');

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/' || p === '') p = '/index.html';
  const fp = path.join(SITE_DIR, path.normalize(p));
  if (!fp.startsWith(SITE_DIR) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { res.writeHead(404); res.end('not found'); return; }
  res.writeHead(200, { 'content-type': MIME[path.extname(fp)] || 'application/octet-stream' });
  fs.createReadStream(fp).pipe(res);
});
await new Promise((r) => server.listen(PORT, HOST, r));
const SITE = `http://${HOST}:${PORT}`;

let chromium;
try { ({ chromium } = await import(path.join(PW_DIR, 'playwright', 'index.mjs'))); }
catch { ({ chromium } = (await import(path.join(PW_DIR, 'playwright', 'index.js'))).default); }

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 900, height: 1000 } });
const pageErrors = [];
const erRessourceFejl = (s) => /Failed to load resource|net::ERR|favicon/i.test(s);
page.on('pageerror', (e) => pageErrors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') { const t = m.text(); if (!erRessourceFejl(t)) pageErrors.push('console.error: ' + t); } });

const cdp = await page.context().newCDPSession(page);
await cdp.send('WebAuthn.enable');
await cdp.send('WebAuthn.addVirtualAuthenticator', {
  options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true },
});

async function shot(name) { await page.waitForTimeout(350); await page.screenshot({ path: path.join(SHOT_DIR, name), fullPage: true }); log('   shot ->', name); }

try {
  log('\nSee-it inbox Fase 2 @', SITE, '(api=' + API_BASE + ')\n');

  // 1. Enroll: custody + credential oprettes i samme browser-kontekst.
  await page.goto(`${SITE}/inbox-enroll.html?t=${encodeURIComponent(ENROLL_TOKEN)}&ingestapi=${encodeURIComponent(API_BASE)}`, { waitUntil: 'load' });
  await page.waitForSelector('#screen-intro.active', { timeout: 8000 });
  await page.click('#btn-start');
  await page.waitForSelector('#screen-oob.active', { timeout: 4000 });
  await page.fill('#in-oob', '7K4P2');
  await page.click('#btn-oob');
  await page.waitForSelector('#screen-done.active', { timeout: 15000 });
  check(true, 'enroll gennemfoert (custody + credential i browseren)');

  // 2. Laes enhedens registrerede pubkey fra IndexedDB (behandler skal kryptere til den).
  const pub = await page.evaluate(() => new Promise((resolve, reject) => {
    const req = indexedDB.open('mycel-inbox', 1);
    req.onsuccess = () => { const db = req.result; const tx = db.transaction('custody', 'readonly'); const rq = tx.objectStore('custody').get('aktiv-enhed'); rq.onsuccess = () => resolve(rq.result); rq.onerror = () => reject(rq.error); };
    req.onerror = () => reject(req.error);
  }));
  check(!!pub && !!pub.x25519_pub, 'enheds-pubkey laest fra custody (tier=' + (pub && pub.tier) + ')');

  // 3. BEHANDLER seeder /outbox med 2 beskeder (mentemEncrypt til enheds-pubkey).
  const beskeder = [
    { tekst: 'Hej. Tak for i dag. Jeg har lagt en lille hjemmeopgave til jer om vejrtrækning. God weekend. Mvh Viktor', traad_id: 'traad-1', besked_uuid: crypto.randomUUID() },
    { tekst: 'Husk at vi ses torsdag kl. 10. Skriv gerne her, hvis noget dukker op inden da.', traad_id: 'traad-1', besked_uuid: crypto.randomUUID() },
  ];
  for (const b of beskeder) {
    const konvolut = await mentemEncrypt(pub.x25519_pub, b);
    const r = await fetch(API_BASE + '/outbox', { method: 'POST', headers: { 'content-type': 'application/json', 'X-Mentem-Service-Token': SERVICE_TOKEN }, body: JSON.stringify({ pseudonym_id: pseudonymID, besked_uuid: b.besked_uuid, ciphertext: JSON.stringify(konvolut), envelope_version: 1 }) });
    if (r.status !== 200) { check(false, 'seed /outbox', String(r.status)); }
  }
  check(true, 'behandler seedede 2 beskeder i /outbox (krypteret til enhedens pubkey)');

  // 4. inbox-view: autentificer -> dekrypter -> render traad.
  await page.goto(`${SITE}/inbox-view.html?p=${encodeURIComponent(pseudonymID)}&ingestapi=${encodeURIComponent(API_BASE)}`, { waitUntil: 'load' });
  await page.waitForSelector('#screen-inbox.active', { timeout: 15000 });
  check(await page.locator('.akut-banner').isVisible(), 'akut-banner altid synligt (spec §8)');
  const antal = await page.locator('.besked').count();
  check(antal === 2, 'to dekrypterede beskeder renderet i traaden', 'antal=' + antal);
  const traadTekst = await page.locator('#traad').innerText();
  check(/hjemmeopgave/.test(traadTekst) && /torsdag/.test(traadTekst), 'klartekst synlig i browseren (browser-side dekrypt E2E)');
  check(!/\d{1,3}\s*(point|score|%)/i.test(traadTekst), 'ingen score/tal i klient-view (brand-split)');
  await shot('01-inbox-traad.png');

  // 5. Tom-tilstand (efter ack) + ikke-understoettet (brand-review gallery).
  await page.evaluate(() => { document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active')); document.getElementById('screen-empty').classList.add('active'); });
  await shot('02-tom-inbox.png');
  await page.evaluate(() => { document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active')); document.getElementById('unsupported-tekst').textContent = 'Din browser understøtter ikke sikre nøgler (passkeys).'; document.getElementById('screen-unsupported').classList.add('active'); });
  await shot('03-ikke-understoettet.png');

  check(pageErrors.length === 0, 'ingen uncaught JS-/console-fejl paa render-stien', pageErrors.join(' | '));
} catch (e) {
  fails++; log('  ❌ walk-fejl:', e.message);
  try { await page.screenshot({ path: path.join(SHOT_DIR, 'FEJL.png'), fullPage: true }); } catch {}
} finally {
  await browser.close(); server.close();
}

log(`\n  ${fails === 0 ? 'SEE-IT GROEN' : fails + ' FEJL'} · shots -> ${SHOT_DIR}\n`);
process.exit(fails === 0 ? 0 : 1);
