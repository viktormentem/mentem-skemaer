// e2e-afsender-stempel.mjs — runtime-bevis for afsender-stemplet (Viktor-ordre 26/7 punkt 2).
//
// HVORFOR RUNTIME: kontrakt-testen (test/afsender-stempel-kontrakt.mjs) beviser at KERNEN
// stempler korrekt når nogen har sat konteksten. Den kan ikke se om SIDEN faktisk sætter
// den. Præcis dét led er der, hele fejlklassen bor: 26/7 var app, worker og fil-vej hver
// for sig korrekte, og kæden mellem dem var brudt. En enhedsprøve pr. led ville have været
// grøn hele vejen igennem det brud.
//
// Denne prøve åbner den RIGTIGE index.html i en rigtig browser og spørger payloaden.
//
// 🔴 DEN ANDEN HALVDEL ER LIGE SÅ VIGTIG: uden meta-tag skal stemplet være null OG siden
// skal være tavs. Mit første udkast hentede deploy-sha.txt over netværket; filen findes
// ikke på main, så det gav en 404 i hver klients konsol. Husets konsol-fejl-vagter fangede
// det. §2 her er den vagt, sat direkte på afsender-stien.
//
//   node test/e2e-afsender-stempel.mjs

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SITE_DIR = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
const PW_DIR = process.env.PW_DIR
  || '/Users/viktornielsen/Documents/MEMTEM/PsykologInvitation/e2e/playwright/node_modules';

const SHA = 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678';

let fails = 0;
const log = (...a) => console.log(...a);
function check(cond, label, extra = '') { if (cond) log('  OK ', label); else { log('  XX ', label, extra); fails++; } }

// ── Statisk server. `injicerMeta` styrer om deployet har stemplet siden. ──
let injicerMeta = false;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json', '.png': 'image/png',
  '.ico': 'image/x-icon' };
const server = http.createServer((req, res) => {
  const p = decodeURIComponent(req.url.split('?')[0]);
  const rel = p === '/' ? '/index.html' : p;
  const file = path.join(SITE_DIR, rel);
  if (!file.startsWith(SITE_DIR) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404); res.end('nope'); return;
  }
  let body = fs.readFileSync(file);
  if (rel === '/index.html') {
    let html = body.toString('utf8');
    if (injicerMeta) {
      // Præcis den indsprøjtning deployet skal lave (se rapporten til INFRA).
      html = html.replace('<head>', `<head>\n<meta name="mentem-deploy-sha" content="${SHA}">`);
    }
    body = Buffer.from(html, 'utf8');
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  res.end(body);
});

// Import-mønsteret er kopieret fra e2e-dagbog-samtykke.mjs:66-68 — huset har allerede
// afgjort hvordan playwright hentes her; jeg opfinder ikke en anden vej.
let chromium;
try { ({ chromium } = await import(path.join(PW_DIR, 'playwright', 'index.mjs'))); }
catch { ({ chromium } = (await import(path.join(PW_DIR, 'playwright', 'index.js'))).default); }

await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true });

async function stempelFraSiden(url) {
  const page = await browser.newPage();
  const konsolFejl = [];
  page.on('console', (m) => { if (m.type() === 'error') konsolFejl.push(m.text()); });
  page.on('pageerror', (e) => konsolFejl.push(String(e)));
  await page.goto(url, { waitUntil: 'networkidle' });
  // Spørg den payload klienten faktisk ville sende — ikke kun modulets interne tilstand.
  const svar = await page.evaluate(async () => {
    const m = await import('./mentem-skema-core.js');
    return {
      stempel: m.afsenderStempel(),
      baselineAfsender: m.buildPayloadBaseline({}, {}).afsender,
      // 🔴 `alder` tilfoejet 15/8, samme grund som i afsender-stempel-kontrakt.mjs:
      // screeningen fik feltet som PAAKRAEVET 12/8, og begge fiksturer er fra 26/7.
      // Proeven har kastet `paakraevet_mangler:alder` siden da, uset, fordi ingen
      // automatik koerer den. `alderOver50` er den AFLEDTE STOP-Bang-vaerdi, ikke raatallet.
      screeningDataHarFelt: 'afsender' in m.buildPayloadScreening({
        alder: 58,
        snorken: true, observeretApnoe: false, dagtraethed: true, hypertension: false,
        bmiOver35: false, alderOver50: true, halsomfangOver40: null, koen: 'kvinde',
        bipolarMani: false, epilepsiAnfald: false, parasomnier: false,
        betydeligFaldrisiko: false, erhvervschauffoer: false, natarbejde: false,
      }, {}).data,
    };
  });
  await page.close();
  return { ...svar, konsolFejl };
}

log('afsender-stempel · runtime (rigtig index.html i rigtig browser):');

// ── §1 DEPLOYET HAR STEMPLET SIDEN + klienten kom ind ad et versioneret link ──
injicerMeta = true;
const medStempel = await stempelFraSiden(`${BASE}/index.html?s=soevn-baseline&v=2`);
check(medStempel.stempel.webDeploySha === SHA, '§1a siden læser deployets SHA fra meta-tagget',
      JSON.stringify(medStempel.stempel));
check(medStempel.stempel.linkVersion === 2, '§1b ?v=2 bliver til tallet 2',
      JSON.stringify(medStempel.stempel));
check(JSON.stringify(medStempel.baselineAfsender) === JSON.stringify({ webDeploySha: SHA, linkVersion: 2 }),
      '§1c stemplet er MED i den payload klienten ville sende',
      JSON.stringify(medStempel.baselineAfsender));
check(medStempel.screeningDataHarFelt === true, '§1d oplysningsskemaets data bærer det også');
check(medStempel.konsolFejl.length === 0, '§1e ingen konsol-fejl', medStempel.konsolFejl.join(' | '));

// ── §2 MAIN I DAG: intet meta-tag, intet ?v= ⇒ null, og TAVSHED ──
injicerMeta = false;
const udenStempel = await stempelFraSiden(`${BASE}/index.html?s=soevn-baseline`);
check(udenStempel.stempel.webDeploySha === null, '§2a ukendt deploy ⇒ null, ikke et gæt',
      JSON.stringify(udenStempel.stempel));
check(udenStempel.stempel.linkVersion === null, '§2b link uden ?v= ⇒ null');
check(udenStempel.konsolFejl.length === 0,
      '§2c og siden er TAVS (vagten mod 404-fetchen jeg først skrev)',
      udenStempel.konsolFejl.join(' | '));

await browser.close();
await new Promise((r) => server.close(r));
log(fails === 0 ? '\n🟢 AFSENDER-STEMPEL RUNTIME OK' : `\n🔴 AFSENDER-STEMPEL FAILED: ${fails} fejl`);
process.exit(fails === 0 ? 0 : 1);
