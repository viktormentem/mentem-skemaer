// e2e-dagbog-samtykke.mjs — runtime-bevis for søvndagbogens Art.9-samtykke (register 1.7).
//
// HVORFOR RUNTIME: samtykkets GYLDIGHED er en adfærds-egenskab, ikke en tekst-egenskab.
// Den kan kun bevises ved at TRÆKKE samtykket tilbage i den rigtige index.html og se hvad
// der sker med klientens dage. En statisk regex kan ikke se det.
//
// DEN AFGØRENDE TEST (fitness function): et fravalg må IKKE koste klienten indtastede dage.
//   - EDPB Guidelines 05/2020 Eksempel 9: klienten mister kun FORDELEN (kontinuitet på
//     tværs af enheder) => ingen skade => samtykket er FRIT og dermed gyldigt.
//   - EDPB Eksempel 8: tjenesten NEDGRADERES ved fravalg => "consent was never validly
//     obtained". Hvis nogen kobler saveCSDState() til consentAccepted(), vipper dagbogen
//     fra Eksempel 9 til Eksempel 8 og samtykket bliver UGYLDIGT med tilbagevirkende kraft.
//   Denne test er vagten mod netop det.
//
// LOCAL_ONLY-REWRITE: prod kører LOCAL_ONLY=true (index.html:533, Viktor-GO 15/6) => draftBase()
// er tom => server-sync strukturelt død => samtykke-blokken renderer INTET (empirisk verificeret).
// Samtykket har KUN mening i den server-wirede v2-sti. Vi serverer derfor index.html med
// LOCAL_ONLY=false, hvilket er PRÆCIS den sti samtykket findes for. Rewriten er testens
// affordance, ikke en prod-ændring: flippes LOCAL_ONLY nogensinde til false, er dette
// beviset for at samtykket opfører sig rigtigt den dag.
//
//   node test/e2e-dagbog-samtykke.mjs

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

// ── Draft-store-attrap: tæller PUT/DELETE mod /api/soevn-draft/{token} ──
const seen = { PUT: 0, DELETE: 0, GET: 0 };
// Periode-headeren pr. PUT (13-08-2026). Serveren fastfryser kladdens levetid efter den,
// og en kilde-prøve kan kun se at klienten BYGGER headeren, aldrig at browseren SENDER den.
// 🔵 Attrappen er SAMME ORIGIN som siden, så preflight udløses ikke her: dette måler
// fetch-vejen, ikke CORS. CORS-siden måles i soevn-periode-header-kontrakt.mjs mod
// serverens egen Access-Control-Allow-Headers.
const putPerioder = [];
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  const p = decodeURIComponent(req.url.split('?')[0]);
  if (p.startsWith('/api/soevn-draft/')) {
    seen[req.method] = (seen[req.method] || 0) + 1;
    if (req.method === 'PUT') putPerioder.push(req.headers['x-soevn-periode-dage'] ?? null);
    // GET = syncDraftOnLoad(). 200 m. tom body = "ingen kladde at gendanne" (recoveredBlob='' → falsy).
    // Bevidst IKKE 404: et fejl-svar ville logge en browser-console-error og gøre
    // zero-console-errors-assertionen nedenfor blind for ægte fejl.
    if (req.method === 'GET') { res.writeHead(200, { 'content-type': 'application/json' }); res.end(''); return; }
    res.writeHead(200, { 'content-type': 'application/json' }); res.end('{}'); return;
  }
  const fp = path.join(SITE_DIR, path.normalize(p === '/' ? '/index.html' : p));
  if (!fp.startsWith(SITE_DIR) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { res.writeHead(404); res.end('nf'); return; }
  let body = fs.readFileSync(fp);
  if (fp.endsWith('index.html')) {
    const src = body.toString('utf8');
    const flipped = src.replace('const LOCAL_ONLY = true;', 'const LOCAL_ONLY = false;');
    if (flipped === src) { console.error('FATAL: LOCAL_ONLY-ankeret findes ikke i index.html — testen ville teste den døde sti.'); process.exit(1); }
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
const ctx = await browser.newContext();
const page = await ctx.newPage();
const consoleErrors = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message));

const LS = 'mentem_csd_v1';
const lsEntries = () => page.evaluate((k) => { const s = JSON.parse(localStorage.getItem(k) || '{}'); return (s.entries || []).length; }, LS);
const lsConsent = () => page.evaluate((k) => { const s = JSON.parse(localStorage.getItem(k) || '{}'); return !!(s.consent && s.consent.accepted); }, LS);
async function udfyldDag() {
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
  await page.waitForTimeout(350);   // fire-and-forget pushDraft()
}

log('\nsøvndagbog: Art.9-samtykke (register 1.7) — runtime');
log(`site=${SITE} (LOCAL_ONLY=false-rewrite: den sti samtykket findes for)\n`);

const tok = 'a'.repeat(32);
// `d=90` er appens standard-periode, og den er BEVIDST forskellig fra webbens
// CSD_DEFAULT_DAYS (14): ellers kunne periode-header-assertionen nedenfor ikke skelne
// »klienten sendte forløbets egen periode« fra »klienten sendte sit eget default«.
const PERIODE = 90;
await page.goto(`${SITE}/?s=soevndagbog&t=${tok}&d=${PERIODE}&api=${encodeURIComponent(SITE)}`, { waitUntil: 'load' });
await page.waitForSelector('#screen-diary-welcome.active');

// ── LAG 1 (art. 13) — oplysningsteksten om BEHANDLINGEN, uden checkbox ──
const opl = await page.$('#diary-oplysning');
check(opl !== null, 'lag 1: art. 13-oplysning renderet paa dagbogs-welcome');
check(await page.$eval('#diary-oplysning a[href*="privatlivspolitik"]', (a) => !!a.href).catch(() => false),
  'lag 1: oplysning linker til privatlivspolitikken');
check(await page.$('#diary-oplysning input[type=checkbox]') === null,
  'lag 1: INGEN checkbox paa behandlings-oplysningen (register 1.3)');

// ── LAG 1, kvitteringen: den er en KNAP, og den folder ────────────────────────────
// 🔴 Tilfoejet 14/8 fordi stien var UTESTET. Kontrollen blev aendret fra checkbox til knap
//    (register 1.3: formen maa ikke ligne et samtykke), og INTET bevis daekkede at
//    fold-adfaerden overlevede skiftet. En rettelse uden en proeve er en paastand.
const kvitKnap = await page.$('#oplysning-hak');
check(kvitKnap !== null, 'lag 1: kvitteringen findes');
check(await page.$eval('#oplysning-hak', (e) => e.tagName.toLowerCase()).catch(() => '?') === 'button',
  'lag 1: kvitteringen er en KNAP, ikke et hak');
// POS-KTRL: den fulde tekst SKAL staa foer der trykkes. Uden dette led ville en flade der
// aldrig renderer noget, bestaa fold-testen nedenfor.
const fuldFoer = await page.$eval('#diary-oplysning', (e) => e.textContent.trim().length).catch(() => 0);
check(fuldFoer > 200, 'lag 1 POS-KTRL: den fulde oplysning staar FOER kvittering', `${fuldFoer} tegn`);
await page.click('#oplysning-hak');
const kortEfter = await page.$eval('#diary-oplysning', (e) => e.textContent.trim().length).catch(() => 0);
check(kortEfter > 0 && kortEfter < fuldFoer, 'lag 1: ét tryk FOLDER teksten til kortform',
  `${fuldFoer} -> ${kortEfter} tegn`);
check(await page.$('#oplysning-mere') !== null, 'lag 1: kortformen tilbyder "Laes det fulde igen"');
await page.click('#oplysning-mere');
const fuldIgen = await page.$eval('#diary-oplysning', (e) => e.textContent.trim().length).catch(() => 0);
check(fuldIgen >= fuldFoer - 60, 'lag 1: den fulde tekst kan hentes tilbage', `${fuldIgen} tegn`);

// ── LAG 2 (art. 9(2)(a)) — samtykket til server-kladden ──
check(await page.$('#diary-consent-cb') !== null, 'lag 2: samtykke-checkbox findes FOER dagbogs-start');
await page.click('#diary-consent-cb');
check(await lsConsent() === true, 'lag 2: samtykke registreret ved ét klik');

// ── Dagbogen i gang: gem dag 1 ──
await udfyldDag();
check(await lsEntries() === 1, 'dag 1 gemt lokalt');
check(seen.PUT >= 1, 'server-kladde PUT\'et mens samtykket var givet', `PUT=${seen.PUT}`);
// TTL-kontrakten, målt på det serveren FAKTISK modtog. Uden headeren fastfryser
// draftstore-workeren kladden på fallbackets 45 dage, altså sletning midt i et
// 90-dages forløb: tavst datatab hos klienten, ingen fejl noget sted.
check(putPerioder.length > 0 && putPerioder.every((p) => p === String(PERIODE)),
  `art. 5(1)(e): hver PUT bar forloebets egen periode (X-Soevn-Periode-Dage: ${PERIODE})`,
  `modtaget: ${JSON.stringify(putPerioder)}`);

// ── ART. 7(3): tilbagetrækning skal være LIGE SÅ LET som at give ──
// Det bevises ved at checkboxen er NÅBAR og operabel MENS dagbogen er i gang (= efter
// mindst én gemt dag), med samme ét-kliks-vej som den blev slået til.
check(await page.$('#diary-consent-cb') !== null,
  'art. 7(3): samtykke-checkbox er NAABAR UNDERVEJS i dagbogen (efter gemt dag)');
check(await page.$eval('#diary-consent-cb', (c) => c.checked) === true,
  'art. 7(3): checkboxen viser den GIVNE tilstand (afkrydset) undervejs');
const putsFoer = seen.PUT;
await page.click('#diary-consent-cb');          // ÉT klik = tilbagetrækning
await page.waitForTimeout(500);
check(await lsConsent() === false, 'art. 7(3): ét klik SLOG SAMTYKKET FRA undervejs');

// ── FITNESS FUNCTION: et fravalg maa IKKE koste klienten indtastede dage ──
// (EDPB 05/2020 Eksempel 9, ikke Eksempel 8). Falder denne, er samtykket ugyldigt.
check(await lsEntries() === 1,
  'FITNESS: tilbagetrækning mistede INGEN indtastede dage (localStorage bevaret)');
check(await page.$('#screen-diary-welcome.active') !== null,
  'FITNESS: dagbogen fortsætter i browseren efter tilbagetrækning');

// ── Tilbagetrækningen skal VIRKE fremadrettet: ingen nye PUT ──
await udfyldDag();
check(await lsEntries() === 1, 'dag kan stadig udfyldes+gemmes lokalt EFTER tilbagetrækning (dedup: samme dag)');
check(seen.PUT === putsFoer, 'tilbagetrækning: INGEN nye server-PUT efter fravalg', `PUT ${putsFoer} -> ${seen.PUT}`);

// ── Art. 17(1)(b): tilbagetrukket samtykke => den allerede PUT'ede kladde skal SLETTES ──
check(seen.DELETE >= 1, 'art. 17(1)(b): allerede PUT\'et server-kladde SLETTET ved tilbagetrækning', `DELETE=${seen.DELETE}`);

// ── Genoptagelse: samtykket kan gives igen med samme lethed ──
await page.click('#diary-consent-cb');
await page.waitForTimeout(400);
check(await lsConsent() === true, 'samtykket kan GIVES IGEN med ét klik (symmetrisk)');
check(await lsEntries() === 1, 'FITNESS: gen-accept mistede heller ingen dage');

check(consoleErrors.length === 0, 'zero console-errors', consoleErrors.join(' | '));

await browser.close();
server.close();
log('');
if (fails > 0) { console.error(`E2E-DAGBOG-SAMTYKKE FAILED: ${fails} fejl`); process.exit(1); }
console.log('E2E-DAGBOG-SAMTYKKE PASSED');
