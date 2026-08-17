// See-it web-walk (chromium) af inbox-enroll.html - klient-inbox Batch 1B.
// Driver den RIGTIGE enroll-flade i en aegte browser mod den lokale worker, med en virtuel
// WebAuthn-authenticator (CDP) saa navigator.credentials.create() fuldfoerer uden hardware.
// Beviser at SIDENS JS driver hele kontrakten (ikke kun node-modulet) + leverer See-it-screenshots
// pr. skaerm til Viktors kliniske/brand-review. Dev/test-only. NUL rigtig klient-data.
//
// FORUDSAETNING: worker koerer paa API_BASE (default 127.0.0.1:8787) med RP_ORIGIN=http://localhost:5173.
// Startes af test/run-inbox-enroll-seeit.sh.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { kraevWorkerEvne, kraevSyntetiskNoegle } from './_forudsaetning.mjs';

const SITE_DIR = path.resolve(fileURLToPath(new URL('../', import.meta.url)));   // mentem-skemaer/
const PW_DIR = process.env.PW_DIR || '/Users/viktornielsen/Documents/MEMTEM/PsykologInvitation/e2e/playwright/node_modules';
const API_BASE = process.env.API_BASE || 'http://127.0.0.1:8787';
const WORKER_DIR = process.env.WORKER_DIR || path.resolve(SITE_DIR, '../PsykologInvitation/ingest-worker');
const SHOT_DIR = process.env.SHOT_DIR || path.join(SITE_DIR, '.seeit-inbox-enroll');
const HOST = 'localhost', PORT = 5173;   // SKAL matche worker RP_ORIGIN (http://localhost:5173)
fs.mkdirSync(SHOT_DIR, { recursive: true });

let fails = 0;
const log = (...a) => console.log(...a);
const check = (cond, label, extra = '') => { if (cond) log('  ✅', label); else { log('  ❌', label, extra); fails++; } };

// ── forudsaetninger FOER noget tungt startes (se test/_forudsaetning.mjs) ─────
// Begge er UMAALT (rc 3), ikke ROED: en manglende forudsaetning er ikke en fejl i fladen.
await kraevWorkerEvne(API_BASE, '/webauthn/register/options', 'inbox-enroll-seeit', 'run-inbox-enroll-seeit.sh');
const keyFile = kraevSyntetiskNoegle(WORKER_DIR, 'inbox-enroll-seeit');

// ── mint Ed25519 enroll-token (worker synth-noegle) ──────────────────────────
const synth = JSON.parse(fs.readFileSync(keyFile));
const tokenPriv = crypto.createPrivateKey({ key: synth.privJwk, format: 'jwk' });
const b64url = (buf) => Buffer.from(buf).toString('base64url');
const pseudonymID = 'SYN-' + crypto.randomUUID();
const exp = Math.floor(Date.now() / 1000) + 3600;
const scopeB64 = b64url(JSON.stringify({ t: 'individ', k: 'enroll' }));
const tokMsg = `v1.${pseudonymID}.${exp}.${scopeB64}`;
const ENROLL_TOKEN = `${tokMsg}.${b64url(crypto.sign(null, Buffer.from(tokMsg), tokenPriv))}`;

// ── lokal MIME-korrekt static-server paa localhost:5173 ──────────────────────
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

// Virtuel WebAuthn-authenticator (CDP): platform/internal, UV auto-verificeret.
const cdp = await page.context().newCDPSession(page);
await cdp.send('WebAuthn.enable');
await cdp.send('WebAuthn.addVirtualAuthenticator', {
  options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true },
});

async function shot(name) { await page.waitForTimeout(350); await page.screenshot({ path: path.join(SHOT_DIR, name), fullPage: true }); log('   shot ->', name); }
const url = `${SITE}/inbox-enroll.html?t=${encodeURIComponent(ENROLL_TOKEN)}&ingestapi=${encodeURIComponent(API_BASE)}`;

try {
  log('\nSee-it inbox-enroll @', SITE, '(api=' + API_BASE + ')\n');
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForSelector('#screen-intro.active', { timeout: 8000 });
  check(await page.locator('.akut-banner').isVisible(), 'akut-banner altid synligt (spec §8)');
  check(await page.locator('#screen-intro .header-logo, .header-logo').first().isVisible(), 'Mycel-brand header');
  await shot('01-intro.png');

  await page.click('#btn-start');
  await page.waitForSelector('#screen-oob.active', { timeout: 4000 });
  await page.fill('#in-oob', '7K4P2');
  await shot('02-oob-kode.png');

  await page.click('#btn-oob');
  await page.waitForSelector('#screen-working.active', { timeout: 4000 });
  await shot('03-tilknytter.png');

  // Virtuel authenticator fuldfoerer create() -> register/verify -> done.
  await page.waitForSelector('#screen-done.active', { timeout: 15000 });
  check(true, 'LIVE-walk naaede kvittering (create -> register/verify E2E i browser)');
  check(await page.locator('#screen-done h2').innerText().then((t) => /tilknyttet/i.test(t)), 'kvittering: "Din enhed er tilknyttet"');
  await shot('04-kvittering.png');

  // Gallery af de betingede skaerme (transient/conditional) til brand-review.
  await page.evaluate(() => { document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active')); document.getElementById('uwrap-banner').style.display = ''; document.getElementById('screen-working').classList.add('active'); });
  await shot('05-fallback-banner.png');
  await page.evaluate(() => { document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active')); document.getElementById('unsupported-tekst').textContent = 'Din browser understøtter ikke sikre nøgler (passkeys).'; document.getElementById('screen-unsupported').classList.add('active'); });
  await shot('06-ikke-understoettet.png');

  check(pageErrors.length === 0, 'ingen uncaught JS-/console-fejl paa render-stien', pageErrors.join(' | '));
} catch (e) {
  fails++; log('  ❌ walk-fejl:', e.message);
  try { await page.screenshot({ path: path.join(SHOT_DIR, 'FEJL.png'), fullPage: true }); } catch {}
} finally {
  await browser.close(); server.close();
}

log(`\n  ${fails === 0 ? 'SEE-IT GROEN' : fails + ' FEJL'} · shots -> ${SHOT_DIR}\n`);
process.exit(fails === 0 ? 0 : 1);
