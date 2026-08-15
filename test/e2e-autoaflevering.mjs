// e2e-autoaflevering.mjs - runtime-bevis for at klienten ikke skal bede om at blive faerdig.
//
// HVORFOR DEN FINDES (Viktor 14/8, ordret):
//   »Naar alle besvarelser er paa plads og klienten faar beskeden "Tak. Du er faerdig", saa
//    skal det sendes automatisk og ikke foerst naar en klient trykker paa "Send sikkert".
//    Det skaber unoedvendige fejl hvor klienter tror de er faerdige naar de faktisk mangler
//    at trykke.«
//
// 🔴 POS-KTRL BAERER HELE PROEVEN, og uden den maaler den ingenting. »Kvitteringen kom
//    uden et klik« er kun interessant hvis der FINDES en sti hvor den ikke kommer. Derfor
//    maales foerst at den manuelle sti stadig kraever sit klik (sag C), og derefter at
//    auto-stien ikke goer (sag A). En side der auto-sendte ALTID ville bestaa sag A
//    perfekt og vaere et brud paa den kohorte der ikke har et v1-token.
//
// 🔴 OG FEJL-SAGEN ER LIGE SAA VIGTIG SOM SUCCES-SAGEN (sag B). Fil-stien gaar gennem
//    `navigator.share`/download, som browseren KUN tillader inden for en brugerhandling.
//    Faldt en fejlet auto-aflevering videre dertil, ville browseren afvise den tavst, og
//    klienten ville staa paa en skaerm der siger »faerdig« uden at vaere det. Praecis den
//    fejl ordren beder os fjerne, bare med et andet fortegn.
//
//   node test/e2e-autoaflevering.mjs
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HER = path.dirname(fileURLToPath(import.meta.url));
const SITE_DIR = path.resolve(HER, '..');
const PW_DIR = process.env.PW_DIR
  || '/Users/viktornielsen/Documents/MEMTEM/PsykologInvitation/e2e/playwright/node_modules';

let fails = 0;
const log = (...a) => console.log(...a);
function check(cond, label, extra = '') { if (cond) log('  OK  ', label); else { log('  XX  ', label, extra); fails++; } }

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  const p = decodeURIComponent(req.url.split('?')[0]);
  const fp = path.join(SITE_DIR, path.normalize(p === '/' ? '/index.html' : p));
  if (!fp.startsWith(SITE_DIR) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { res.writeHead(404); res.end('nf'); return; }
  res.writeHead(200, { 'content-type': MIME[path.extname(fp)] || 'application/octet-stream' });
  res.end(fs.readFileSync(fp));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const SITE = `http://127.0.0.1:${server.address().port}`;

let chromium;
try { ({ chromium } = await import(path.join(PW_DIR, 'playwright', 'index.mjs'))); }
catch { ({ chromium } = (await import(path.join(PW_DIR, 'playwright', 'index.js'))).default); }
const browser = await chromium.launch({ headless: true });

// Formen skal matche autoSendEnabled(): ^v1\.[^.]+\.\d+\.[^.]+\.[^.]+$
const V1 = 'v1.testpseudonym.1795099493.scope.signatur';

// Udfyld hele trin-skemaet. Returnerer hvor mange trin der blev besvaret.
async function udfyldStepper(page) {
  // 🔴 IKKE `el.value = ...` i en `page.evaluate`. Min foerste udgave gjorde det, og
  //    proeven faldt paa ca. hver tredje koersel med »#instrument-submit is not enabled«:
  //    et paakraevet svar var ikke registreret. At saette `.value` og selv sende `input`
  //    er en EFTERLIGNING af at skrive; `fill()` er det. **En efterligning der virker to
  //    gange ud af tre, er en ustabil proeve, og en ustabil proeve kan ikke doemme en
  //    mutant** - den ville melde drab paa tilfaeldige mutanter og frikende andre.
  let n = 0;
  for (let vagt = 0; vagt < 60; vagt++) {
    const form = await page.evaluate(() => {
      const trin = Array.from(document.querySelectorAll('#instrument-fields > .instrument-field'))
        .find((s) => !s.hidden);
      if (!trin) return { slags: 'intet-trin' };
      if (!trin.id) trin.id = 'proeve-trin-' + Math.floor(Math.random() * 1e9);
      const r = trin.querySelector('input[type=radio]');
      if (r) return { slags: 'radio', trin: trin.id };
      const num = trin.querySelector('input[type=number], input[inputmode=numeric], input[type=text]');
      if (num) return { slags: 'tal', trin: trin.id };
      return { slags: 'ukendt', trin: trin.id };
    });
    if (form.slags === 'intet-trin') break;
    // 🔴 EFTERPROEV AT SVARET TOG. Uden dette faldt riggen paa ca. hver tredje koersel med
    //    et ubesvaret felt (maalt: `{idx:1, radios:2}`), og fejlen saa ud som om produktet
    //    var i stykker. **Et klik er ikke et svar foer feltet siger at det er det.**
    let tog = false;
    for (let forsoeg = 0; forsoeg < 3 && !tog; forsoeg++) {
      if (form.slags === 'radio') {
        await page.locator(`#${form.trin} input[type=radio]`).first().check({ force: true });
      } else if (form.slags === 'tal') {
        await page.locator(`#${form.trin} input[type=number], #${form.trin} input[inputmode=numeric], #${form.trin} input[type=text]`).first().fill('42');
      }
      tog = await page.evaluate((id) => {
        const f = document.getElementById(id);
        if (!f) return false;
        const r = f.querySelectorAll('input[type=radio]');
        if (r.length) return Array.from(r).some((x) => x.checked);
        const t = f.querySelectorAll('input[type=number], input[inputmode=numeric], input[type=text]');
        if (t.length) return Array.from(t).some((x) => (x.value || '').trim() !== '');
        return true;
      }, form.trin);
    }
    if (!tog) throw new Error('RIGGEN ER DOED, ingen dom: kunne ikke besvare trin ' + form.trin);
    n++;
    const next = await page.$('#a11y-next');
    if (!next || !(await next.isVisible())) break;
    const foer = await page.evaluate(() => {
      const h = document.getElementById('a11y-step-head');
      return h ? h.textContent : '';
    });
    await next.click();
    await page.waitForFunction((f) => {
      const h = document.getElementById('a11y-step-head');
      return h && h.textContent !== f;
    }, foer, { timeout: 5000 }).catch(() => {});
  }
  return n;
}

async function koer({ navn, medToken, ingestSvar }) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const fejl = [];
  page.on('pageerror', (e) => fejl.push('pageerror: ' + e.message));

  // 🔴 STUBBEN ER MAALT, IKKE GAETTET, og min foerste var forkert paa to punkter:
  //  1. `sendTilIngest` kraever `j.status === 'received' || j.duplicate` for at kalde det
  //     sendt. Min foerste stub svarede `{ok:true}`, altsaa 200 med et svar workeren aldrig
  //     ville give, og proeven meldte vagten defekt. **En groen proeve mod en forkert stub
  //     beviser ingenting; en roed goer det samme.**
  //  2. Et `route.fulfill` mod en ANDEN oprindelse er stadig underlagt CORS i browseren.
  //     Uden `access-control-allow-origin` afvises svaret foer koden ser det, og fejlen
  //     ville ligne en logikfejl i auto-afleveringen.
  const CORS = {
    'access-control-allow-origin': '*',
    'access-control-allow-headers': '*',
    'access-control-allow-methods': 'POST, OPTIONS',
  };
  let ingestKald = 0;
  await page.route('https://ingest.mycel.dk/**', async (route) => {
    if (route.request().method() === 'OPTIONS') { await route.fulfill({ status: 204, headers: CORS }); return; }
    ingestKald++;
    if (ingestSvar === 'fejl') { await route.fulfill({ status: 500, headers: CORS, body: '{}' }); return; }
    await route.fulfill({
      status: 200, headers: { ...CORS, 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'received' }),
    });
  });

  const q = medToken ? `?s=soevn-screening&t=${V1}` : '?s=soevn-screening';
  await page.goto(`${SITE}/${q}`, { waitUntil: 'load' });

  // Forsiden -> start
  await page.waitForSelector('#screen-screening-welcome.active', { timeout: 10000 });
  await page.click('#screening-start-btn');
  await page.waitForSelector('#instrument-fields', { timeout: 10000 });

  const besvarede = await udfyldStepper(page);

  // Gennemse -> send
  // 🔴 IKKE waitForTimeout. Min foerste udgave ventede 120 ms og var groen een gang og
  //    roed den naeste: `#instrument-review-submit` er DEAKTIVERET indtil hvert paakraevet
  //    svar er sat, og en fast ventetid er et gaet om hvornaar det er sket.
  //    **En ustabil proeve kan ikke doemme en mutant** - den ville melde drab paa
  //    tilfaeldige mutanter og frikende andre. Vi venter paa TILSTANDEN, ikke paa uret.
  // 🔴 REPARATIONS-FEJNING. Et svar kan TAGE og derefter blive TABT: trin-loekken
  //    efterproever hvert svar, og alligevel stod felt nr. 2 tomt paa ca. hver tiende
  //    koersel. Altsaa optegnes feltet om EFTER at svaret sad, og efterproevningen
  //    maalte et oejeblik der ikke varede. Vi fejer derfor til sidst, hvor alle felter
  //    findes i DOM'en, og gentager indtil intet mangler.
  //    🔵 Jeg har IKKE fundet hvad der optegner om, og skriver det hellere end at lade
  //    en fejning se ud som om aarsagen var kendt.
  for (let runde = 0; runde < 6; runde++) {
    const mangler = await page.evaluate(() => {
      let rettet = 0, tilbage = 0;
      document.querySelectorAll('#instrument-fields > .instrument-field').forEach((f) => {
        const r = f.querySelectorAll('input[type=radio]');
        const t = f.querySelectorAll('input[type=number], input[inputmode=numeric], input[type=text]');
        if (r.length) {
          if (!Array.from(r).some((x) => x.checked)) { r[0].click(); rettet++; }
        } else if (t.length) {
          if (!Array.from(t).some((x) => (x.value || '').trim() !== '')) {
            t[0].value = '42';
            t[0].dispatchEvent(new Event('input', { bubbles: true }));
            t[0].dispatchEvent(new Event('change', { bubbles: true }));
            rettet++;
          }
        }
      });
      document.querySelectorAll('#instrument-fields > .instrument-field').forEach((f) => {
        const r = f.querySelectorAll('input[type=radio]');
        const t = f.querySelectorAll('input[type=number], input[inputmode=numeric], input[type=text]');
        if (r.length && !Array.from(r).some((x) => x.checked)) tilbage++;
        else if (!r.length && t.length && !Array.from(t).some((x) => (x.value || '').trim() !== '')) tilbage++;
      });
      return { rettet, tilbage };
    });
    if (mangler.tilbage === 0) break;
    await page.waitForTimeout(120);
  }

  // Naegt at doemme paa et halvt udfyldt skema: en raa Playwright-timeout her ville
  // ligne en fejl i produktet, og den ville vaere riggens.
  try {
    await page.waitForSelector('#instrument-submit:not([disabled])', { timeout: 8000 });
  } catch (e) {
    const mangler = await page.evaluate(() => {
      const ubesvarede = [];
      document.querySelectorAll('#instrument-fields > .instrument-field').forEach((f, idx) => {
        const radios = f.querySelectorAll('input[type=radio]');
        const tekst = f.querySelectorAll('input[type=number], input[inputmode=numeric], input[type=text]');
        let svaret = false;
        if (radios.length) svaret = Array.from(radios).some((r) => r.checked);
        else if (tekst.length) svaret = Array.from(tekst).some((t) => (t.value || '').trim() !== '');
        else svaret = true;
        if (!svaret) ubesvarede.push({ idx, id: f.id || '(uden id)', radios: radios.length, tekst: tekst.length });
      });
      return { ubesvarede };
    });
    throw new Error('RIGGEN ER DOED, ingen dom: #instrument-submit blev aldrig aktiv -> '
      + JSON.stringify(mangler) + ' (et paakraevet svar mangler; udfyldningen er utilstraekkelig)');
  }
  await page.click('#instrument-submit');
  await page.waitForSelector('#screen-instrument-review.active', { timeout: 10000 });
  await page.waitForSelector('#instrument-review-submit:not([disabled])', { timeout: 10000 });
  await page.click('#instrument-review-submit');
  // 🔴 Igen ikke et tal millisekunder. Kryptering + netkald tager den tid det tager, og en
  //    fast pause gjorde SAG A groen tre gange ud af fire. Vi venter paa at status er
  //    FAERDIG: enten en kvittering, en aerlig fejl, eller fil-stien - men aldrig
  //    "Krypterer ...", som er tilstanden midt i.
  await page.waitForFunction(() => {
    const done = document.querySelector('#screen-done.active');
    if (!done) return false;
    const st = document.getElementById('done-status');
    const t = st ? st.textContent.trim() : '';
    const btn = document.getElementById('share-btn');
    const knapFremme = btn && !btn.hidden && btn.offsetParent !== null;
    if (/Krypterer/i.test(t)) return false;
    return t.length > 0 || knapFremme;      // enten et svar, eller en knap at trykke paa
  }, null, { timeout: 15000 });

  const tilstand = await page.evaluate(() => {
    const btn = document.getElementById('share-btn');
    const st = document.getElementById('done-status');
    return {
      doneAktiv: !!document.querySelector('#screen-done.active'),
      knapSkjult: btn ? (btn.hidden || btn.offsetParent === null) : null,
      status: st ? st.textContent.trim() : '',
      ledetekst: (document.querySelector('#screen-done p') || {}).textContent || '',
    };
  });

  await ctx.close();
  return { besvarede, ingestKald, tilstand, fejl };
}

log('e2e-autoaflevering');
log('');

// ── SAG A: v1-token + ingest svarer 200 -> sendt UDEN et eneste klik paa knappen
const A = await koer({ navn: 'A', medToken: true, ingestSvar: 'ok' });
log('SAG A  v1-token, ingest 200');
check(A.tilstand.doneAktiv, 'afslutningsskaermen naaet', JSON.stringify(A.tilstand));
check(A.ingestKald >= 1, 'ingest blev kaldt UDEN et klik paa #share-btn', 'kald=' + A.ingestKald);
check(/sendt sikkert og krypteret/i.test(A.tilstand.status), 'kvitteringen staar', A.tilstand.status);
check(A.tilstand.knapSkjult === true, 'knappen er skjult (der er intet at trykke paa)');
check(!/Tryk nedenfor/i.test(A.tilstand.ledetekst), 'ledeteksten lover ikke et klik der ikke findes', A.tilstand.ledetekst);
check(A.fejl.length === 0, '0 sidefejl', A.fejl.join(' | '));
log('');

// ── SAG B: v1-token + ingest fejler -> knappen KOMMER TILBAGE med en aerlig besked
const B = await koer({ navn: 'B', medToken: true, ingestSvar: 'fejl' });
log('SAG B  v1-token, ingest 500');
check(B.ingestKald >= 1, 'auto-afleveringen blev forsoegt', 'kald=' + B.ingestKald);
check(B.tilstand.knapSkjult === false, 'knappen er GIVET TILBAGE (ingen tavs blindgyde)');
check(/blev ikke sendt/i.test(B.tilstand.status), 'beskeden er aerlig om at intet blev sendt', B.tilstand.status);
check(!/sendt sikkert og krypteret/i.test(B.tilstand.status), 'ingen falsk kvittering', B.tilstand.status);
log('');

// ── SAG C (POS-KTRL): UDEN v1-token maa intet fyre af sig selv
const C = await koer({ navn: 'C', medToken: false, ingestSvar: 'ok' });
log('SAG C  POS-KTRL: intet token');
check(C.tilstand.doneAktiv, 'afslutningsskaermen naaet ogsaa her', JSON.stringify(C.tilstand));
check(C.ingestKald === 0, 'INTET blev sendt af sig selv', 'kald=' + C.ingestKald);
check(C.tilstand.knapSkjult === false, 'knappen staar, som den altid har gjort');
check(/Tryk nedenfor/i.test(C.tilstand.ledetekst), 'den manuelle ledetekst er uroert', C.tilstand.ledetekst);
log('');

// ── SAG D: trin-skiftet lander paa spoergsmaalet, ikke paa dokumenttoppen
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 700 } });
  const page = await ctx.newPage();
  await page.goto(`${SITE}/?s=soevn-screening&t=${V1}`, { waitUntil: 'load' });
  await page.waitForSelector('#screen-screening-welcome.active');
  await page.click('#screening-start-btn');
  await page.waitForSelector('#instrument-fields');

  const foerste = await page.evaluate(() => window.scrollY);
  // besvar trin 1 og gaa videre
  await page.evaluate(() => {
    const trin = Array.from(document.querySelectorAll('#instrument-fields > .instrument-field')).find((s) => !s.hidden);
    const r = trin && trin.querySelector('input[type=radio]'); if (r) r.click();
  });
  await page.click('#a11y-next');
  await page.waitForTimeout(250);
  const efter = await page.evaluate(() => {
    const head = document.getElementById('a11y-step-head');
    const r = head ? head.getBoundingClientRect() : null;
    const bar = Array.from(document.querySelectorAll('.form-progress'))
      .find((el) => el.offsetParent !== null && el.getBoundingClientRect().height > 0);
    return {
      y: window.scrollY, headTop: r ? r.top : null, vh: window.innerHeight,
      barH: bar ? Math.round(bar.getBoundingClientRect().height) : 0,
    };
  });
  log('SAG D  rulning ved trin-skifte');
  check(foerste === 0, 'trin 1 starter i dokumenttoppen (introen skal laeses)', 'y=' + foerste);
  check(efter.y > 0, 'trin 2 rullede IKKE tilbage til toppen', 'y=' + efter.y);
  // 🔴 STRAMMET 14/8 efter See-it. Foerste form kraevede kun »oeverste halvdel«, og
  //    headTop = 12 opfyldte det - men den KLAEBENDE bjaelke er 50 px hoej, saa
  //    overskriften laa BAG den. Proeven var groen og skaermen var forkert.
  //    Kravet er nu at overskriften ligger UNDER bjaelken, altsaa faktisk synlig.
  check(efter.barH > 0, 'den klaebende bjaelke blev fundet (ellers maaler naeste linje intet)',
    'barH=' + efter.barH);
  check(efter.headTop !== null && efter.headTop >= efter.barH && efter.headTop < efter.vh * 0.5,
    'spoergsmaalsoverskriften staar UNDER bjaelken og i oeverste halvdel',
    'headTop=' + efter.headTop + ' barH=' + efter.barH + ' vh=' + efter.vh);
  await ctx.close();
}

await browser.close();
server.close();
log('');
log(fails === 0 ? 'e2e-autoaflevering ✓ alle groenne' : `e2e-autoaflevering ✗ ${fails} fejl`);
process.exit(fails === 0 ? 0 : 1);
