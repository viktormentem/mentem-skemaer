// e2e-ess-godkendelsesreview.mjs — ESS-skaermene: bygget, ikke godkendt.
//
// Byg-ordre 17/8 (E2): »1 BYG skaermene med ESS verbatim · 2 SKYD screenshots af ALLE sider
// hvor ESS optraeder · 3 VIKTOR indsender dem via ePROVIDE til MRT-review · 4 FOERST derefter
// maa de bruges paa en aegte klient.« Raekkefoelgen er omvendt af intuitionen: siderne skal
// FINDES foer godkendelsen kan soeges. Denne proeve maaler begge halvdele af det:
//
//   A. SKAERMENE FINDES OG ER VERBATIM   ellers er der intet at indsende
//   B. EN KLIENT KAN IKKE NAA DEM        ellers er §4.4 brudt i det sekund siden udrulles
//
// 🔴 Uden arm B ville arm A vaere en aktiv skade: en fuldt fungerende ESS paa en offentlig
// flade, uden godkendelse. De to arme maa derfor ALDRIG staa i hver sin proeve.
//
// NUL aegte PHI, NUL netvaerk, INGEN worker: instrument-flowet har ingen server-transport
// overhovedet (det emitterer en [MYCEL v1]-tekstblok klienten selv sender). Det er ogsaa
// selve grunden til at review-visningen er ufarlig: der er ingen kanal at laekke ad.
//
// SIDEGEVINST, og den er ordrens punkt 2: med SHOT_DIR sat skriver proeven de screenshots
// Viktor skal indsende. Samme koersel der BEVISER at skaermene er rigtige, PRODUCERER det
// der skal godkendes. Et billede taget i haanden beviser ikke hvad koden goer.
//
//   node test/e2e-ess-godkendelsesreview.mjs
//   SHOT_DIR=~/Desktop/ess-screenshots node test/e2e-ess-godkendelsesreview.mjs

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ESS_INSTRUMENT, REVIEW_PARAM } from '../mentem-skema-core.js';

const SITE_DIR = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
const PW_DIR = process.env.PW_DIR
  || path.resolve(SITE_DIR, '../PsykologInvitation/e2e/playwright/node_modules');
const SHOT_DIR = process.env.SHOT_DIR || '';

let fails = 0;
const log = (...a) => console.log(...a);
function check(cond, label, extra = '') { if (cond) log('  OK  ', label); else { log('  XX  ', label, extra); fails++; } }

// rc 3 = UMAALT. En manglende Playwright er ikke en roed proeve, det er ingen proeve.
if (!fs.existsSync(path.join(PW_DIR, 'playwright'))) {
  console.error(`UMAALT: Playwright ikke fundet i ${PW_DIR} (saet PW_DIR=). Ingen dom afgivet.`);
  process.exit(3);
}
if (SHOT_DIR) fs.mkdirSync(SHOT_DIR, { recursive: true });

// ── Lokal statisk server ────────────────────────────────────────────────────
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
// Telefon-viewport: licensen er BYOD (klientens egen telefon), saa det er den flade Mapi
// skal godkende. Et screenshot i desktop-bredde ville vise en side ingen klient ser.
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
const sidefejl = [];
page.on('pageerror', (e) => sidefejl.push(String(e && e.message || e)));

const aktivSkaerm = () => page.$eval('.screen.active', (el) => el.id).catch(() => null);
async function skud(navn) {
  if (!SHOT_DIR) return;
  await page.screenshot({ path: path.join(SHOT_DIR, navn + '.png'), fullPage: true });
}

// ════════════════════════════════════════════════════════════════════════════
log('\n== 1/5 ARM B: et KLIENT-link kan ikke naa ESS ==');
// ════════════════════════════════════════════════════════════════════════════
// Det almindelige instrument-link. Rammer INSTRUMENTER, hvor ess ikke staar.
await page.goto(`${SITE}/?s=ess`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.screen.active', { timeout: 8000 });
const klientSkaerm = await aktivSkaerm();
check(klientSkaerm !== 'screen-instrument', '?s=ess alene rammer IKKE instrument-skaermen', klientSkaerm);
const essTekstSynlig = await page.evaluate(() => document.body.innerText.includes('småblunder'));
check(essTekstSynlig === false, 'ingen ESS-ordlyd nogen steder paa siden', String(essTekstSynlig));

// Review-parameteren alene raekker ikke hvis tokenet er der: laas 3.
// Et token er beviset paa at linket er sendt til et menneske.
const FALSK_TOKEN = 'v1.SYN-ess-neg.9999999999.eyJ0Ijoic3ludGV0aXNrIn0.AAAA';
await page.goto(`${SITE}/?s=ess&${REVIEW_PARAM}=1&it=${encodeURIComponent(FALSK_TOKEN)}`,
  { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.screen.active', { timeout: 8000 });
const medTokenSkaerm = await aktivSkaerm();
check(medTokenSkaerm !== 'screen-instrument',
  'review-parameter + ingest-token rammer IKKE instrument-skaermen (laas 3 holder)', medTokenSkaerm);

// Og en tastefejl i selve parameteren maa ikke aabne noget.
await page.goto(`${SITE}/?s=ess&${REVIEW_PARAM}=ja`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.screen.active', { timeout: 8000 });
check(await aktivSkaerm() !== 'screen-instrument', 'godkendelsesreview=ja (ikke =1) aabner intet', await aktivSkaerm());

// ════════════════════════════════════════════════════════════════════════════
log('\n== 2/5 ARM A: review-linket renderer skaermen ==');
// ════════════════════════════════════════════════════════════════════════════
await page.goto(`${SITE}/?s=ess&${REVIEW_PARAM}=1`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.screen.active', { timeout: 8000 });
check(await aktivSkaerm() === 'screen-instrument', 'review-linket lander paa instrument-skaermen', await aktivSkaerm());

const titel = await page.$eval('#instrument-title', (el) => el.textContent.trim());
check(titel === ESS_INSTRUMENT.uiTitle, `sidetitel = '${ESS_INSTRUMENT.uiTitle}'`, titel);

// ── VERBATIM: hvert item, hvert skala-anker, instruktionen. Ord for ord. ────
// Det er den eneste af de fem arme licensgiveren faktisk godkender paa.
const domTekster = await page.$$eval('.instrument-field legend', (ns) =>
  ns.map((n) => n.textContent.replace(/^\s*\d+\.\s*/, '').trim()));
check(domTekster.length === 8, '8 spoergsmaal i DOM', String(domTekster.length));
ESS_INSTRUMENT.scoredItems.forEach((it, i) => {
  check(domTekster[i] === it.text, `item ${i + 1} verbatim`, `DOM='${domTekster[i]}'`);
});
const ankre = await page.$$eval('.instrument-field:first-of-type .radio-option', (ns) =>
  ns.map((n) => n.textContent.trim()));
ESS_INSTRUMENT.options.forEach((opt, i) => {
  // Badge-stien saetter tallet som et eget span foran ordlyden -> "0ville aldrig smaablunde".
  check(ankre[i] && ankre[i].includes(opt.label), `skala-anker ${opt.value} verbatim`, `DOM='${ankre[i]}'`);
});
const intro = await page.$eval('#instrument-intro', (el) => el.textContent.trim());
check(intro === ESS_INSTRUMENT.instruktion, 'instruktionen verbatim', intro.slice(0, 60));

// 🔴 STEPPEREN SKAL VAERE I GANG. Foerste koersel 17/8 viste 8 af 8 spoergsmaal samtidig,
// fordi aktiveringen kun spurgte paa `instrumentId`. Skaermen fungerede, saa ingen proeve
// var roed, men screenshottet viste en side klienten aldrig kommer til at se. Maales paa
// SYNLIGHED i DOM'en, ikke paa om funktionen blev kaldt: det er skaermen der er paastanden.
const synligeTrin = await page.$$eval('.instrument-field',
  (ns) => ns.filter((n) => n.offsetParent !== null).length);
check(synligeTrin === 1, `praecis 1 spoergsmaal synligt ad gangen (maalt ${synligeTrin} af 8)`, String(synligeTrin));

// ── COPYRIGHT-NOTITSEN er en HAARD licensbetingelse (Special Terms §4.4) ────
// 🔴 Maalt paa SYNLIGHED, ikke paa textContent. Foerste udgave af denne proeve laeste
// textContent, og det virker ogsaa paa et skjult element: den ville have vaeret groen paa
// syv skaerme hvor notitsen ikke stod. En naal der ikke kan se forskel paa vist og skjult,
// maaler ikke det licensen kraever.
const NOTITS = 'ESS © MW Johns 1990-1997. Used under License.';
const attrSpoerg = await page.$eval('#instrument-attribution',
  (el) => ({ tekst: el.textContent.trim(), synlig: el.offsetParent !== null }));
check(attrSpoerg.synlig, 'copyright-notitsen er SYNLIG paa spoergeskaermen', String(attrSpoerg.synlig));
check(attrSpoerg.tekst.includes(NOTITS), 'copyright-notitsen staar ordret', attrSpoerg.tekst);
check(attrSpoerg.tekst.includes('Epworth'), 'instrumentets eget verbatim navn staar ogsaa der', attrSpoerg.tekst);

// Tallet skal vaere SYNLIGT: den verbatim instruktion siger »vaelg det bedst passende nummer«.
const badges = await page.$$eval('.instr-val-badge', (ns) => ns.length);
check(badges >= 8 * 4, `tal-badges synlige paa alle svarknapper (${badges} >= 32)`, String(badges));

// Trin-billederne skydes i arm 3 (eet pr. trin); her skydes kun det der er unikt for arm 2.

// ════════════════════════════════════════════════════════════════════════════
log('\n== 3/5 UDFYLDNING: alle 8 besvares, review-skaermen naas ==');
// ════════════════════════════════════════════════════════════════════════════
// Svarene er valgt saa summen IKKE kan opstaa ved et tilfaelde (0+1+2+3+0+1+2+3 = 12).
const SVAR = [0, 1, 2, 3, 0, 1, 2, 3];
const FORVENTET_SUM = SVAR.reduce((a, b) => a + b, 0);
// 🔴 Der skydes eet billede PR. TRIN, ikke eet af skaermen. Licensen siger »ALLE elektroniske
// sider hvor ESS optraeder«, og i et eet-spoergsmaal-ad-gangen-flow er hvert trin en side for
// klienten. Et enkelt billede ville vise 1 af 8 og se komplet ud.
let trinUdenNotits = 0;
for (let i = 0; i < 8; i++) {
  await page.waitForSelector(`#ess_item_${i + 1}-${SVAR[i]}`, { state: 'visible', timeout: 8000 });
  // Licensbetingelsen maales paa HVERT trin, ikke stikproevevis paa det foerste.
  const notitsSynlig = await page.$eval('#instrument-attribution',
    (el) => el.offsetParent !== null && el.textContent.includes('MW Johns'));
  if (!notitsSynlig) trinUdenNotits++;
  await skud(`ess-trin-${String(i + 1).padStart(2, '0')}-af-8`);
  await page.click(`#ess_item_${i + 1}-${SVAR[i]}`);
  // Seende auto-frem har 320 ms forsinkelse (seeingAdvanceInstr); vent den ud, ellers
  // fotograferer naeste runde det trin der er paa vej ud.
  await page.waitForTimeout(420);
}
check(trinUdenNotits === 0, `copyright-notitsen synlig paa ALLE 8 trin (${trinUdenNotits} trin uden)`, String(trinUdenNotits));
const submitDisabled = await page.$eval('#instrument-submit', (el) => el.disabled);
check(submitDisabled === false, 'send-knappen er aaben naar alle 8 er besvaret', String(submitDisabled));
await page.click('#instrument-submit');
await page.waitForSelector('#screen-instrument-review.active', { timeout: 8000 });
check(await aktivSkaerm() === 'screen-instrument-review', 'review-skaermen naas', await aktivSkaerm());

const attrReview = await page.$eval('#instrument-review-attribution', (el) => el.textContent.trim());
check(attrReview.includes(NOTITS), 'copyright-notitsen staar OGSAA paa review-skaermen', attrReview);
const reviewRaekker = await page.$$eval('.instrument-review-row', (ns) => ns.length);
check(reviewRaekker === 8, '8 raekker paa review-skaermen', String(reviewRaekker));

await skud('02-ess-reviewskaerm');

// ════════════════════════════════════════════════════════════════════════════
log('\n== 4/5 KVITTERINGEN: [MYCEL v1] med ess_sum, ALTID beregnet ==');
// ════════════════════════════════════════════════════════════════════════════
await page.click('#instrument-review-submit');
await page.waitForSelector('#screen-instrument-done.active', { timeout: 8000 });
const mycel = await page.$eval('#instrument-done-status textarea', (el) => el.value);
check(mycel.startsWith('[MYCEL v1]'), 'konvolut-hoved [MYCEL v1]', mycel.slice(0, 20));
check(/^skabelon: ess$/m.test(mycel), 'skabelon: ess', '');
for (let i = 0; i < 8; i++) {
  check(new RegExp(`^ess_item_${i + 1}: ${SVAR[i]}$`, 'm').test(mycel), `ess_item_${i + 1}: ${SVAR[i]}`, '');
}
check(new RegExp(`^ess_sum: ${FORVENTET_SUM}$`, 'm').test(mycel), `ess_sum: ${FORVENTET_SUM} (beregnet, ikke hardcodet)`,
  (mycel.match(/^ess_sum: .*$/m) || ['<mangler>'])[0]);
// 🔴 NEG-KTRL paa summen: en fast forventning kan vaere groen mod en hardcodet vaerdi.
// Nålen skal kunne se FORSKEL, ellers maaler den ingenting.
check(!new RegExp(`^ess_sum: ${FORVENTET_SUM + 1}$`, 'm').test(mycel),
  `NEG-KTRL: ess_sum er IKKE ${FORVENTET_SUM + 1} (naalen kan skelne)`, '');
// Ingen tolkning i konvolutten: >10-graensen er kliniker-side og maa ikke smugles ind.
check(!/sleepiness|excessive|svaerhed|flag/i.test(mycel), 'ingen tolkning/flag i konvolutten', '');

await skud('03-ess-kvittering');

// ════════════════════════════════════════════════════════════════════════════
log('\n== 5/5 INGEN TAVSE SIDEFEJL ==');
// ════════════════════════════════════════════════════════════════════════════
check(sidefejl.length === 0, `0 ufangede sidefejl (maalt ${sidefejl.length})`, sidefejl.join(' | '));

await browser.close();
await new Promise((r) => server.close(r));

if (SHOT_DIR) log(`\n  screenshots skrevet til ${SHOT_DIR} (3 sider: spoergeskaerm, review, kvittering)`);
log(fails === 0 ? '\nE2E ESS-GODKENDELSESREVIEW PASSED ✅' : `\nE2E ESS-GODKENDELSESREVIEW FAILED ❌ (${fails})`);
process.exit(fails === 0 ? 0 : 1);
