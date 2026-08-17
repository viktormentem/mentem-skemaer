// e2e-etlink-kaede.mjs — synthetic end-to-end for ÉT LINK gennem flere opgaver.
//
// Viktor-ordre 2026-08-17: »Vi skal gøre sådan så der kun er et link«. Ordren kunne ikke
// leveres med ordlyd alene: fladens dispatch tager den FØRSTE art der matcher, så et link
// med flere opgaver kørte den første igen og igen. Denne prøve måler kæden.
//
// NUL ægte PHI. Token-type 'syntetisk' (spec §8.7, kan ALDRIG binde en rigtig klient).
// Forudsætter en kørende lokal ingest-worker: bash test/run-etlink-kaede-e2e.sh
//
// 🔴 DE TRE TING DER MÅLES, og hvorfor netop de tre:
//   1. ROUTINGEN   et kæde-link lander på det trin der MANGLER, ikke altid på det første.
//   2. MÆRKET      en LYKKET aflevering skriver trinnet af, og tilbyder at fortsætte.
//   3. GENSYNET    en genindlæsning (= hun lukkede fanen) lander samme sted som knappen
//                  ville have sendt hende hen. Fortsæt-stien og gensyns-stien ER samme sti,
//                  og prøven her er beviset for at de ikke kan skride fra hinanden.
//
// 🔵 Og en fjerde, negativ: UDEN `it=` er kæden inaktiv og fladen opfører sig NØJAGTIG som
// før. Uden den arm kunne prøven være grøn på en side der havde ændret adfærd for alle.

import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { kraevSyntetiskNoegle, kraevWorkerEvne } from './_forudsaetning.mjs';

const SITE_DIR    = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
const WORKER_BASE = (process.env.WORKER_BASE || 'http://127.0.0.1:8787').replace(/\/+$/, '');
const WORKER_DIR  = process.env.WORKER_DIR
  || path.resolve(SITE_DIR, '../PsykologInvitation/ingest-worker');
const PW_DIR = process.env.PW_DIR
  || path.resolve(SITE_DIR, '../PsykologInvitation/e2e/playwright/node_modules');

let fails = 0;
const log = (...a) => console.log(...a);
function check(cond, label, extra = '') { if (cond) log('  OK  ', label); else { log('  XX  ', label, extra); fails++; } }

await kraevWorkerEvne(WORKER_BASE, '/submit', 'e2e-etlink-kaede', 'run-etlink-kaede-e2e.sh');

// ── 1. Mønt et KÆDE-token (scope.s som LISTE, ikke som streng) ──────────────
const SYNTH_KEYFILE = process.env.SYNTH_KEYFILE || kraevSyntetiskNoegle(WORKER_DIR, 'e2e-etlink-kaede');
const synth = JSON.parse(fs.readFileSync(SYNTH_KEYFILE, 'utf8'));
const tokenPriv = crypto.createPrivateKey({ key: synth.privJwk, format: 'jwk' });
const b64url = (buf) => Buffer.from(buf).toString('base64url');
function mintToken({ pseudonymID, exp, scope }) {
  const scopeB64 = b64url(JSON.stringify(scope));
  const msg = `v1.${pseudonymID}.${exp}.${scopeB64}`;
  return `${msg}.${b64url(crypto.sign(null, Buffer.from(msg), tokenPriv))}`;
}
const KAEDEN = ['soevn-screening', 'soevn-baseline', 'soevndagbog'];
const pseudonymID = 'SYN-kaede-' + crypto.randomUUID();
const exp = Math.floor(Date.now() / 1000) + 3600;
// 🔴 Listen er hele forskellen. Med `s: 'soevn-baseline'` (streng) ville workeren svare
// 403 schema_scope_mismatch på trin to, og kæden kunne ikke eksistere.
const itToken = mintToken({ pseudonymID, exp, scope: { t: 'syntetisk', s: KAEDEN, d: 90, max: 100 } });

// ── 2. Frisk syntetisk INGEST X25519-par (recipient, kun i hukommelsen) ─────
const ingestKp = crypto.generateKeyPairSync('x25519');
const ingestPubB64url = Buffer.from(
  ingestKp.publicKey.export({ type: 'spki', format: 'der' }).slice(-32)).toString('base64url');

// ── 3. Lokal statisk server (origin 127.0.0.1 → TEST_HOST → ?ingestpk/?ingestapi aktiv) ──
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

// To importformer, fordi pakken har skiftet form mellem installationer. Samme greb som
// e2e-autosend.mjs; en enkelt form gav `chromium === undefined` og en fejl der pegede på
// linjen efter.
let chromium;
try { ({ chromium } = await import(path.join(PW_DIR, 'playwright', 'index.mjs'))); }
catch { ({ chromium } = (await import(path.join(PW_DIR, 'playwright', 'index.js'))).default); }
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext();
const page = await ctx.newPage();
// 🔴 En ufanget sidefejl efterlader klienten på »Krypterer …« for evigt og gør det TAVST
// (målt 17/8 i e2e-ema.mjs). Prøven lytter derfor udefra, ikke på konsollen.
const sidefejl = [];
page.on('pageerror', (e) => sidefejl.push(String(e && e.message || e)));

function kaedeUrl(skemaer) {
  return `${SITE}/?s=${skemaer.join(',')}&it=${encodeURIComponent(itToken)}`
    + `&ingestpk=${encodeURIComponent(ingestPubB64url)}&ingestapi=${encodeURIComponent(WORKER_BASE)}`;
}
/// Hvilken skærm står klienten på? Bevidst aflæst på DOM'en og ikke på en intern variabel:
/// det er skærmen klienten ser, der er påstanden.
async function aktivSkaerm() {
  return page.$eval('.screen.active', (el) => el.id).catch(() => null);
}
/// Skriv et trin af, præcis som `markerAfleveret` gør det. Bruges til at stille kæden i en
/// tilstand uden at udfylde tre skemaer, dér hvor det er ROUTINGEN der måles.
async function saetAfleveret(ids) {
  await page.evaluate(([pid, liste]) => {
    const alt = JSON.parse(localStorage.getItem('mentem_kaede_v1') || '{}');
    alt[pid] = alt[pid] || {};
    for (const id of liste) alt[pid][id] = new Date().toISOString();
    localStorage.setItem('mentem_kaede_v1', JSON.stringify(alt));
  }, [pseudonymID, ids]);
}
async function ryd() {
  await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
}

// ════════════════════════════════════════════════════════════════════════════
log('\n== 1/4 ROUTINGEN: kæden lander på det trin der mangler ==');
// ════════════════════════════════════════════════════════════════════════════
await page.goto(kaedeUrl(KAEDEN), { waitUntil: 'domcontentloaded' });
await ryd();
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForSelector('.screen.active', { timeout: 8000 });
check(await aktivSkaerm() === 'screen-screening-welcome',
  'intet afleveret -> screeningen (sikkerhedsgaten foerst)', await aktivSkaerm());

await saetAfleveret(['soevn-screening']);
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForSelector('.screen.active', { timeout: 8000 });
check(await aktivSkaerm() === 'screen-baseline-welcome',
  'screening afleveret -> BASELINE (og ikke screeningen igen)', await aktivSkaerm());

await saetAfleveret(['soevn-baseline']);
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForSelector('.screen.active', { timeout: 8000 });
const efterBegge = await aktivSkaerm();
check(efterBegge && efterBegge.indexOf('diary') >= 0,
  'begge engangsskemaer afleveret -> dagbogen (kaedens hvilested)', efterBegge);

// 🔴 Dagbogen maa ALDRIG kunne skrives af. Uden den her ville kaeden kunne loebe toer og
// efterlade klienten paa en skaerm uden opgave, praecis den fejl ordren blev skrevet for.
await saetAfleveret(['soevndagbog']);
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForSelector('.screen.active', { timeout: 8000 });
const efterAlle = await aktivSkaerm();
check(efterAlle === efterBegge, 'dagbogen er VARIG: et maerke paa den aendrer ingenting', efterAlle);

// ════════════════════════════════════════════════════════════════════════════
log('\n== 2/4 MAERKET: en LYKKET aflevering skriver trinnet af og tilbyder naeste ==');
// ════════════════════════════════════════════════════════════════════════════
// Baseline er det trin der kan udfyldes maskinelt uden at replikere hele screeningens
// trin-for-trin-navigation. Kaeden er derfor toleddet her: baseline -> dagbog.
await page.goto(kaedeUrl(['soevn-baseline', 'soevndagbog']), { waitUntil: 'domcontentloaded' });
await ryd();
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForSelector('#baseline-start-btn', { timeout: 8000 });
await page.click('#baseline-start-btn');
await page.waitForSelector('#baseline-fields input, #baseline-fields .radio-option', { timeout: 8000 });
await page.evaluate(() => {
  const set = new Set();
  document.querySelectorAll('#baseline-fields input[type=radio]').forEach((r) => {
    if (!set.has(r.name)) { set.add(r.name); r.checked = true; r.dispatchEvent(new Event('change', { bubbles: true })); }
  });
  document.querySelectorAll('#baseline-fields input[type=number]').forEach((n) => { n.value = '42'; n.dispatchEvent(new Event('input', { bubbles: true })); });
  document.querySelectorAll('#baseline-fields input[type=time]').forEach((t) => { t.value = '07:00'; t.dispatchEvent(new Event('input', { bubbles: true })); });
});
await page.waitForSelector('#baseline-finish-btn:not([disabled])', { timeout: 8000 });
await page.click('#baseline-finish-btn');
await page.waitForSelector('#screen-done.active', { timeout: 8000 });

// Afleveringen starter af sig selv naar `it=` er sat (14/8-kontrakten). Vent paa at
// kvitteringen faktisk lander, frem for paa en timer.
await page.waitForSelector('#done-status .kvittering-primaer', { timeout: 20000 });
const maerket = await page.evaluate((pid) => {
  const alt = JSON.parse(localStorage.getItem('mentem_kaede_v1') || '{}');
  return !!(alt[pid] && alt[pid]['soevn-baseline']);
}, pseudonymID);
check(maerket, 'en LYKKET aflevering skrev trinnet af i kaeden');

const fortsaetTekst = await page.$eval('#done-status button', (b) => b.textContent).catch(() => null);
check(!!fortsaetTekst && /Fortsæt til/.test(fortsaetTekst),
  'kvitteringen tilbyder at fortsaette frem for at slutte paa »Tak!«', String(fortsaetTekst));
check(!!fortsaetTekst && /søvndagbog/i.test(fortsaetTekst),
  'knappen navngiver naeste opgave med skemaets EGET klientvendte navn', String(fortsaetTekst));

// ════════════════════════════════════════════════════════════════════════════
log('\n== 3/4 GENSYNET: knappen og den lukkede fane fører samme sted hen ==');
// ════════════════════════════════════════════════════════════════════════════
await page.click('#done-status button');
await page.waitForSelector('.screen.active', { timeout: 8000 });
const efterKnap = await aktivSkaerm();
check(efterKnap && efterKnap.indexOf('diary') >= 0, 'knappen »Fortsaet« foerer til dagbogen', efterKnap);

// Samme URL, ny indlaesning: praecis hvad der sker hvis hun lukker fanen og trykker paa
// linket igen i morgen tidlig. 🔵 Den maa ikke lande paa baseline igen; det var den
// oprindelige fejl, bare et trin laengere fremme.
await page.goto(kaedeUrl(['soevn-baseline', 'soevndagbog']), { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.screen.active', { timeout: 8000 });
check(await aktivSkaerm() === efterKnap,
  'en frisk indlaesning lander SAMME sted som knappen (een sti, ikke to)', await aktivSkaerm());

// ════════════════════════════════════════════════════════════════════════════
log('\n== 4/4 NEG-KTRL: uden it= er kaeden inaktiv og fladen uaendret ==');
// ════════════════════════════════════════════════════════════════════════════
// 🔴 Uden denne arm kunne alt ovenfor vaere groent paa en side der havde aendret adfaerd
// for HVER klient, ogsaa dem med et gammelt link. Kaeden er gatet paa `it=`, fordi
// auto-afleveringen er det: uden token sender klienten filer i haanden, og at kaede dér
// ville bede hende sende tre filer i traek.
await page.goto(`${SITE}/?s=soevn-baseline,soevndagbog`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.screen.active', { timeout: 8000 });
check(await aktivSkaerm() === 'screen-baseline-welcome',
  'uden it=: foerste art der matcher, praecis som foer kaeden fandtes', await aktivSkaerm());
// POS-KTRL for selve naalen: den SKAL kunne se en forskel mellem de to tilstande, ellers
// maaler »uaendret« ingenting. Med token og baseline afleveret laa vi paa dagbogen.
check(efterKnap !== 'screen-baseline-welcome',
  'POS-KTRL: naalen skelner faktisk de to tilstande', `${efterKnap} vs screen-baseline-welcome`);

check(sidefejl.length === 0, 'ingen ufanget sidefejl undervejs', sidefejl.join(' | '));

await browser.close();
await new Promise((r) => server.close(r));
log(fails === 0 ? '\nET-LINK-KAEDE GROEN' : `\n${fails} FAIL`);
process.exit(fails === 0 ? 0 : 1);
