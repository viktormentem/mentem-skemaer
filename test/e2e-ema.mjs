// E2E: EMA hele vejen fra klientens browser til dekrypteret klartekst.
//
// web (?s=ema) -> mentemEncrypt -> POST /submit -> D1 -> /pending -> dekrypt
// plus kadence-ruten /ema/naeste, som er det led der goer at klienten kan noejes med
// EET link uden at siden gemmer noget lokalt.
//
// HVORFOR DEN FINDES: kontrakt-proeven (`ema-kontrakt.mjs`) maaler at de tre steder er
// ENIGE om at skemaet findes. Den kan ikke maale at en klient faktisk kan udfylde det og
// at svaret kan laeses igen. **Enighed om et navn er ikke en fungerende kaede**, og det
// var praecis forskellen der kostede en klient sine data 26/7.
//
// FORUDSAETNING: en lokal worker paa WORKER_BASE. Startes af test/run-ema-e2e.sh.
// NUL aegte PHI: syntetisk token, frisk X25519-par i hukommelsen, opdigtede tal.
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { kraevSyntetiskNoegle, kraevWorkerEvne } from './_forudsaetning.mjs';

const SITE_DIR    = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
const WORKER_BASE = (process.env.WORKER_BASE || 'http://127.0.0.1:8787').replace(/\/+$/, '');
const SVC_TOKEN   = process.env.SVC_TOKEN || 'dev-service-token-SYNTHETIC';
const WORKER_DIR  = process.env.WORKER_DIR
  || path.resolve(SITE_DIR, '../PsykologInvitation/ingest-worker');
const PW_DIR = process.env.PW_DIR
  || '/Users/viktornielsen/Documents/MEMTEM/PsykologInvitation/e2e/playwright/node_modules';

let fejl = 0;
const log = (...a) => console.log(...a);
const ok = (b, t, ekstra = '') => { log(b ? '  OK ' : '  XX ', t, ekstra); if (!b) fejl++; };

// Forudsaetninger foerst, saa en manglende worker giver rc 3 UMAALT og ikke en roed dom.
await kraevWorkerEvne(WORKER_BASE, '/submit', 'e2e-ema', 'run-ema-e2e.sh');
const KEYFILE = process.env.SYNTH_KEYFILE || kraevSyntetiskNoegle(WORKER_DIR, 'e2e-ema');

// ── syntetisk it=-token (samme form som autosend-harnessen) ──────────────────
const synth = JSON.parse(fs.readFileSync(KEYFILE, 'utf8'));
const tokenPriv = crypto.createPrivateKey({ key: synth.privJwk, format: 'jwk' });
const b64url = (b) => Buffer.from(b).toString('base64url');
const pseudonymID = 'SYN-ema-' + crypto.randomUUID();
const exp = Math.floor(Date.now() / 1000) + 3600;
const scopeB64 = b64url(JSON.stringify({ t: 'syntetisk', s: 'ema', max: 20 }));
const tokMsg = `v1.${pseudonymID}.${exp}.${scopeB64}`;
const itToken = `${tokMsg}.${b64url(crypto.sign(null, Buffer.from(tokMsg), tokenPriv))}`;

// ── frisk INGEST X25519-par, kun i hukommelsen ───────────────────────────────
const kp = crypto.generateKeyPairSync('x25519');
const pubRaw = kp.publicKey.export({ type: 'spki', format: 'der' }).slice(-32);
const pubB64url = Buffer.from(pubRaw).toString('base64url');
function raaTilX25519(raw32) {
  const p = Buffer.from('302a300506032b656e032100', 'hex');
  return crypto.createPublicKey({ key: Buffer.concat([p, Buffer.from(raw32)]), format: 'der', type: 'spki' });
}
function dekrypter(c, priv) {
  const std = (s) => Buffer.from(s, 'base64');
  const shared = crypto.diffieHellman({ privateKey: priv, publicKey: raaTilX25519(std(c.ephemeralPublicKey)) });
  const key = Buffer.from(crypto.hkdfSync('sha256', shared, std(c.salt),
    Buffer.from('TherapyCopilot-E2E-Export-v1'), 32));
  const d = crypto.createDecipheriv('aes-256-gcm', key, std(c.nonce));
  d.setAuthTag(std(c.tag));
  return JSON.parse(Buffer.concat([d.update(std(c.encryptedData)), d.final()]).toString('utf8'));
}

// ── lokal statisk server ─────────────────────────────────────────────────────
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/' || p === '') p = '/index.html';
  const fp = path.join(SITE_DIR, path.normalize(p));
  if (!fp.startsWith(SITE_DIR) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { res.writeHead(404); res.end('nej'); return; }
  res.writeHead(200, { 'content-type': MIME[path.extname(fp)] || 'application/octet-stream' });
  fs.createReadStream(fp).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const SITE = `http://127.0.0.1:${server.address().port}`;

let chromium;
try { ({ chromium } = await import(path.join(PW_DIR, 'playwright', 'index.mjs'))); }
catch { ({ chromium } = (await import(path.join(PW_DIR, 'playwright', 'index.js'))).default); }
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 900, height: 1000 } });
const sidefejl = [];
let submitPosts = 0;
page.on('pageerror', (e) => sidefejl.push('pageerror: ' + String(e)));
// 🔴 `pageerror` ALENE ER IKKE NOK MERE, og det er en aendring VI selv lavede.
// Indtil 17/8 boblede en fejl i afleveringen op som en unhandled rejection, fordi ingen
// await'ede `shareEncrypted`. Det er nu lukket: `afleverSikkert` (index.html) fanger den
// og giver klienten knappen tilbage. Kuren er rigtig for klienten , og den slukkede
// praecis det signal harnessen laeste. **Et net der fanger en fejl, fjerner ogsaa dens
// spor**, saa maaleren skal flytte med over paa den kanal kuren skriver til.
page.on('console', (m) => { if (m.type() === 'error') sidefejl.push('console.error: ' + m.text()); });
page.on('request', (r) => { if (r.method() === 'POST' && /\/submit$/.test(r.url())) submitPosts++; });

log(`\nEMA e2e  site=${SITE}  worker=${WORKER_BASE}  pseudonym=${pseudonymID}\n`);

try {
  // ── 1. KADENCEN foer noget er afgivet: foerste prompt skal vaere klar ───────
  const r1 = await fetch(`${WORKER_BASE}/ema/naeste?t=${encodeURIComponent(itToken)}`).then((r) => r.json());
  ok(r1.ok === true && r1.klar === true, 'kadence: foerste prompt er klar', JSON.stringify(r1));
  ok(r1.afgivet_i_dag === 0, 'kadence: nul afgivet endnu', String(r1.afgivet_i_dag));

  // 🔴 NEG-KTRL PAA RUTEN SELV, foer vi stoler paa dens ja: et ugyldigt token skal give
  // 401. En rute der svarer »klar« til hvem som helst, er ikke en kadence, den er en
  // aabning.
  const r401 = await fetch(`${WORKER_BASE}/ema/naeste?t=v1.x.1.y.z`);
  ok(r401.status === 401, 'kadence: ugyldigt token afvises med 401', String(r401.status));

  // ── 2. Klienten udfylder i browseren ───────────────────────────────────────
  const url = `${SITE}/?s=ema&it=${encodeURIComponent(itToken)}`
    + `&ingestpk=${encodeURIComponent(pubB64url)}&ingestapi=${encodeURIComponent(WORKER_BASE)}`;
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForSelector('#start-btn:not([disabled])', { timeout: 8000 });
  ok(true, 'siden accepterer ?s=ema og aabner for start');

  await page.click('#start-btn');
  await page.waitForSelector('.vas-slider', { timeout: 8000 });
  const antalSkalaer = await page.locator('.vas-slider').count();
  // 🔵 PRAECIS to. Ikke »mindst«: to items ER dataminimerings-beslutningen i
  // art. 30-aktivitet 13, og en harness der godtog flere ville lade den skride.
  ok(antalSkalaer === 2, 'praecis 2 skalaer vises (art. 30 aktivitet 13)', String(antalSkalaer));

  await page.evaluate(() => {
    document.querySelectorAll('.vas-slider').forEach((s, i) => {
      s.value = i === 0 ? '70' : '40';
      s.dispatchEvent(new Event('input', { bubbles: true }));
      s.dispatchEvent(new Event('change', { bubbles: true }));
    });
  });
  await page.waitForSelector('#finish-btn:not([disabled])', { timeout: 8000 });
  await page.click('#finish-btn');
  // 🔴 KVITTERINGS-SKAERMEN ER IKKE BEVIS FOR AT NOGET BLEV SENDT. Maalt 16/8: den
  // vises mens krypteringen stadig koerer (»Krypterer …«), og en harness der spurgte
  // `/pending` her, fandt nul og meldte det som en fejl i kaeden. **Fejlen var i
  // maaleren: den maalte et skaermskift og kaldte det en aflevering.**
  // Vi venter derfor paa den STATUS der kun kan staa der naar POST'en er lykkedes,
  // og paa at vi selv har SET requesten.
  await page.waitForFunction(() => {
    const s = document.getElementById('done-status');
    return s && /sendt sikkert og krypteret/i.test(s.textContent || '');
  }, { timeout: 20000 }).catch(() => {});
  const statusTxt = await page.$eval('#done-status', (e) => e.textContent || '').catch(() => '');
  // 🔴 SIDEFEJLENE SKAL STAA HER, IKKE FOERST TIL SIDST. `sidefejl`-kontrollen er blokkens
  // sidste linje, saa den naas ALDRIG naar afleveringen fejler: dekrypt-trinnet kaster
  // foerst paa `mine[0].ciphertext`. Maalt 17/8 kostede det en hel session , harnessen
  // meldte »Krypterer …« og 0 POST, mens aarsagen (`ReferenceError: battery is not
  // defined`) laa opsamlet i en variabel ingen naaede at printe. **En roed dom der ikke
  // baerer sin egen aarsag, sender naeste laeser efter den forkerte kur**, her efter
  // krypto, som var det eneste led der virkede.
  ok(/sendt sikkert og krypteret/i.test(statusTxt), 'klienten fik kvittering for SENDT',
    statusTxt.slice(0, 60) + (sidefejl.length ? `  || JS-FEJL PAA SIDEN: ${sidefejl.join(' | ')}` : ''));
  ok(submitPosts >= 1, 'POST /submit blev faktisk affyret', `submitPosts=${submitPosts}`);

  // ── 3. Kom det frem, og kan det laeses? ────────────────────────────────────
  const pend = await fetch(`${WORKER_BASE}/pending`, {
    headers: { 'X-Mentem-Service-Token': SVC_TOKEN },
  }).then((r) => r.json());
  // 🔴 FELTNAVNENE ER camelCase. `/pending` koerer raekkerne gennem `rowToRecord`
  // (ingest-worker/src/index.js:150), som mapper `pseudonym_id` -> `pseudonymID` og
  // `schema_type` -> `schemaType`. Jeg skrev foerst kolonnenavnene fra D1, og de findes
  // ikke i svaret: filteret gav 0 og saa ud som om afleveringen aldrig kom frem.
  // **En naal der laeser et felt API'et aldrig sender, kan kun vaere roed** , den er ikke
  // en maaling, den er en konstant. Soesteren `e2e-autosend.mjs:212` havde det rigtigt
  // hele tiden; denne gang var det den NYE proeve der afveg, ikke den gamle.
  // POS-KTRL paa selve svaret, saa et tomt filter ikke kan forveksles med et tomt svar:
  ok((pend.pending || []).length >= 1, 'PULL: /pending svarer med mindst een raekke',
    `count=${pend.count}`);
  const mine = (pend.pending || pend.messages || []).filter((m) => m.pseudonymID === pseudonymID);
  ok(mine.length === 1, 'PULL: praecis een aflevering for vores pseudonym', String(mine.length));
  ok(mine[0]?.schemaType === 'ema', 'PULL: schemaType er "ema"', mine[0]?.schemaType);

  const klar = dekrypter(JSON.parse(mine[0].ciphertext), kp.privateKey);
  // 🔴 MAAL STRUKTUREN, IKKE EN UNDERSTRENG. Den foerste udgave af de tre linjer her
  // spurgte `/worry/.test(JSON.stringify(klar))` og `/70/ && /40/`. Begge ville vaere
  // GROENNE paa en payload hvor tallene laa et vilkaarligt sted , og »70« findes i
  // ethvert ISO-tidsstempel fra 1970 og i enhver base64-streng. **En understreng er
  // ikke et felt.** Det er ogsaa den eneste grund til at de tre linjer var det sidste
  // led der faldt: de kunne slet ikke se at `questionnaireScores` var tom.
  const r = klar.data.emaRatings || [];
  const find = (k) => r.find((x) => x.category === k);
  ok(r.length === 2, 'DEKRYPT: praecis 2 emaRatings', String(r.length));
  ok(find('worry')?.rating === 70, 'DEKRYPT: `worry` = 70', String(find('worry')?.rating));
  ok(find('uncontrollability')?.rating === 40, 'DEKRYPT: `uncontrollability` = 40',
    String(find('uncontrollability')?.rating));
  // NEG-KTRL paa selve opslaget: et navn der ikke findes skal give undefined, ellers
  // maaler `find` ikke det den ser ud til at maale.
  ok(find('zzq-findes-ikke') === undefined, 'NEG-KTRL: ukendt noegle giver undefined');
  ok(r.every((x) => Number.isInteger(x.rating) && x.rating >= 0 && x.rating <= 100),
    'DEKRYPT: begge ratings er heltal i 0-100');
  // 🔴 Og at der IKKE er opfundet en CAS-serie ved siden af: to EMA-svar maa aldrig
  // lande som en fjerde-dels-udfyldt `casTrends` i psykologens forloebskurve.
  ok(klar.data.casTrends === undefined, 'ingen fabrikeret casTrends fra en EMA',
    JSON.stringify(klar.data.casTrends));

  // ── 4. KADENCEN EFTER: nu skal den spaerre, og sige hvorfor ────────────────
  const r2 = await fetch(`${WORKER_BASE}/ema/naeste?t=${encodeURIComponent(itToken)}`).then((r) => r.json());
  ok(r2.klar === false, 'kadence: spaerrer umiddelbart efter en aflevering');
  ok(r2.grund === 'for_kort_siden', 'kadence: grunden er afstanden, ikke kvoten', r2.grund);
  ok(r2.afgivet_i_dag === 1, 'kadence: taeller den afgivne', String(r2.afgivet_i_dag));

  ok(sidefejl.length === 0, 'ingen uncaught JS-fejl paa klientens sti', sidefejl.join(' | '));
} catch (e) {
  fejl++; log('  XX  e2e-fejl:', e.message);
} finally {
  await browser.close(); server.close();
}

log(`\n  ${fejl === 0 ? 'EMA E2E ALL GREEN' : fejl + ' FEJL'}\n`);
process.exit(fejl === 0 ? 0 : 1);
