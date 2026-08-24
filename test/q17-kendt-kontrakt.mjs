// Q17-kontrakt: fladen spørger ikke om det journalen allerede har, og den kan ikke
// komme til at springe et spørgsmål over uden at have svaret at lægge i stedet.
//
// HVORFOR DEN FINDES. Q17's tre fejl er alle TAVSE, og to af dem ligner succes:
//   1. »pålidelig« uden en værdi springer feltet over  -> `clientName` bliver tom, og
//      MentemSyncService.swift:201 `fallbackKlient(forKlientNavn:)` har intet at
//      matche på når token-joinet fejler. Klientens svar lander i ingen journal, og
//      det ser ud som om alt gik godt: fladen var PÆNERE end før.
//   2. serveren sender `cpr`, og fladen renderer det   -> et CPR i en browser, over
//      et link der kan videresendes. Præcis det spec §Q17 forbyder i store bogstaver.
//   3. et dødt opslag læses som »vi har intet«         -> ingen forskel på »journalen
//      siger vi ikke har det« og »vi kunne ikke spørge«. Begge skal ende i `spoerg`,
//      men kun den ene må kunne kaldes en måling.
//
// Køres:  node test/q17-kendt-kontrakt.mjs      Selvtest: node test/q17-kendt-kontrakt.mjs --selftest
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  q17Dom, q17FeltDom, q17NavneHandling,
  Q17_TILLADTE_FELTER, Q17_FORBUDTE_FELTER, Q17_KENDT_KONTRAKT,
} from '../mentem-skema-core.js';

const HER = dirname(fileURLToPath(import.meta.url));
const INDEX = join(HER, '..', 'index.html');

let fejl = 0;
const ok = (c, n, hvorfor) => { console.log((c ? '  ✓ ' : '  ✗ FAIL ') + n + (c ? '' : '\n        ' + (hvorfor || ''))); if (!c) fejl++; };
const doed = (m) => { console.error('INSTRUMENTET ER DOEDT, ingen dom: ' + m); process.exit(3); };

// ── 0. INSTRUMENTETS EGEN KONTROL ────────────────────────────────────────────────
// POS-KTRL: en dom vi VED skal falde ud i `bekraeft`. NEG-KTRL: et felt vi VED er
// forbudt. Er begge ikke som ventet, måler filen ikke det den tror, og må ikke dømme.
{
  const pos = q17FeltDom('navn', { tilstand: 'lav', vaerdi: 'A B' }).handling;
  const neg = q17FeltDom('cpr',  { tilstand: 'paalidelig', vaerdi: '0101801234' }).handling;
  if (pos !== 'bekraeft') doed('POS-KTRL: navn/lav gav »' + pos + '«, ikke »bekraeft«');
  if (neg !== 'forbudt')  doed('NEG-KTRL: cpr gav »' + neg + '«, ikke »forbudt«');
}
const kilde = readFileSync(INDEX, 'utf8');
if (kilde.length < 10000) doed('index.html blev læst som ' + kilde.length + ' tegn');

console.log('\n── 1. de tre niveauer fra spec §Q17 ──');
ok(q17FeltDom('navn', { tilstand: 'paalidelig', vaerdi: 'Anne Hansen' }).handling === 'spring',
   'pålideligt felt -> spring over, tavst');
ok(q17FeltDom('navn', { tilstand: 'lav', vaerdi: 'Anne Hansen' }).handling === 'bekraeft',
   'lav konfidens -> vis til bekræftelse');
ok(q17FeltDom('navn', { tilstand: 'ukendt', vaerdi: null }).handling === 'spoerg',
   'har vi det ikke -> spørg');

console.log('\n── 2. »spring spørgsmålet over« må ALDRIG springe svaret over ──');
{
  const d = q17FeltDom('navn', { tilstand: 'paalidelig', vaerdi: '' });
  ok(d.handling === 'spoerg', 'pålidelig UDEN værdi falder til spørg, ikke til spring',
     'gav »' + d.handling + '«: fladen ville blive pænere og payloaden tomme');
  ok(/redningsnet/.test(d.grund), 'grunden navngiver hvad der ville gå tabt');
}
ok(q17FeltDom('navn', { tilstand: 'paalidelig', vaerdi: '   ' }).handling === 'spoerg',
   'whitespace tæller ikke som en værdi');
ok(q17FeltDom('navn', { tilstand: 'lav', vaerdi: null }).handling === 'spoerg',
   'lav konfidens uden værdi har intet at vise, og spørger');
{
  const d = q17FeltDom('navn', { tilstand: 'paalidelig', vaerdi: '  Anne Hansen  ' });
  ok(d.vaerdi === 'Anne Hansen', 'værdien trimmes, så payloaden ikke bærer serverens whitespace');
}

console.log('\n── 3. CPR og telefon: forbudt ved konstruktion ──');
ok(!Q17_TILLADTE_FELTER.includes('cpr'), 'cpr står ikke på tilladelseslisten');
ok(!Q17_TILLADTE_FELTER.includes('telefon'), 'telefon står ikke på tilladelseslisten');
for (const f of Object.keys(Q17_FORBUDTE_FELTER)) {
  const d = q17FeltDom(f, { tilstand: 'paalidelig', vaerdi: 'x' });
  ok(d.handling === 'forbudt' && d.vaerdi === null, f + ' -> forbudt, og værdien bæres ikke videre');
  ok(typeof d.grund === 'string' && d.grund.length > 20, f + ' afvises med en NAVNGIVEN grund');
}
ok(q17FeltDom('bopael', { tilstand: 'paalidelig', vaerdi: 'x' }).handling === 'forbudt',
   'et felt der hverken er tilladt eller kendt-forbudt, afvises også');

console.log('\n── 4. et forbudt felt forgifter HELE svaret (fail-closed) ──');
{
  const d = q17Dom({ ok: true, felter: {
    navn: { tilstand: 'paalidelig', vaerdi: 'Anne Hansen' },
    cpr:  { tilstand: 'paalidelig', vaerdi: '0101801234' },
  } });
  ok(d.brugt === false, 'svaret bruges ikke');
  ok(Object.keys(d.felter).length === 0, 'heller ikke det LOVLIGE felt i samme svar',
     'en server der sender CPR, er en server hvis øvrige svar vi heller ikke kan stole på');
  ok(d.afvist.length === 1 && /^cpr: /.test(d.afvist[0]), 'afvisningen navngiver feltet');
  ok(q17NavneHandling(d).handling === 'spoerg', 'fladen falder tilbage til at spørge');
}

console.log('\n── 5. et dødt opslag ender samme sted som »vi har intet«, men er ikke det samme ──');
for (const [navn, svar] of [
  ['intet svar (netværksfejl)', null],
  ['ok: false',                 { ok: false, err: 'unauthorized' }],
  ['ok uden felter',            { ok: true }],
  ['felter er ikke et objekt',  { ok: true, felter: 'navn' }],
  ['en streng',                 'ok'],
]) {
  const d = q17Dom(svar);
  ok(d.brugt === false && q17NavneHandling(d).handling === 'spoerg', navn + ' -> spørg');
}
ok(q17Dom({ ok: true, felter: { navn: { tilstand: 'sikker', vaerdi: 'A B' } } }).felter.navn.handling === 'spoerg',
   'en tilstand vi ikke kender, gætter vi ikke på');

console.log('\n── 6. kontrakten er skrevet ud, så de to halvdele ikke kan drive ──');
ok(Q17_KENDT_KONTRAKT.rute === '/offentlig/klient-kendt' && Q17_KENDT_KONTRAKT.metode === 'POST',
   'rute og metode står i koden (MJ BUILDER 24/8: /offentlig/-præfiks + POST)');
ok(/^\/offentlig\//.test(Q17_KENDT_KONTRAKT.rute),
   'ruten ligger under /offentlig/, ellers svarer den aldrig en browser',
   'MJs tunnel-regel er path ^/offentlig/; /klient/ er et login-præfiks hos dem');
ok(Q17_KENDT_KONTRAKT.kropsnoegle === 't' && !('parameter' in Q17_KENDT_KONTRAKT),
   'tokenet har en KROPS-nøgle, og query-parameteren er VÆK',
   'stod den der endnu, kunne et kaldested nå at bruge den');
{
  // 🔴 Den celle der faktisk vogter det: tokenet må ikke kunne havne i URLen.
  const frag = kilde.slice(kilde.indexOf('async function q17HentKendt'),
                           kilde.indexOf('function q17AnvendNavn'));
  ok(!/\?.*ingestToken|\+\s*'\?'/.test(frag), 'kaldet bygger INGEN query-streng med tokenet');
  ok(/body:\s*JSON\.stringify/.test(frag), 'tokenet sendes i kroppen');
  ok(/method:\s*Q17_KENDT_KONTRAKT\.metode/.test(frag), 'metoden læses af kontrakten, ikke hardkodet');
}
ok(Q17_KENDT_KONTRAKT.origin === 'journal',
   'origin er journal, IKKE nul-viden-postkassen',
   'ingest-workeren må per migrations/0001_init.sql ikke kende et navn');

console.log('\n── 7. fladen har præcis ÉT stamdata-spørgsmål, og gaten sidder på det ──');
{
  const navneFelter = (kilde.match(/id="patient-name"/g) || []).length;
  ok(navneFelter === 1, 'præcis ét patient-name-felt i index.html (målt: ' + navneFelter + ')');
  const cpr = (kilde.match(/\bcpr\b/gi) || []).length;
  ok(cpr === 0, 'nul forekomster af »cpr« i index.html (målt: ' + cpr + ')');
  const telFelt = (kilde.match(/type="tel"/g) || []).length;
  ok(telFelt === 0, 'nul telefon-INPUT i index.html (målt: ' + telFelt + ')');
  ok(/q17NavneHandling/.test(kilde), 'dommen er WIRED i index.html, ikke kun bygget',
     'et modul ingen kalder, er ikke en flade');
}

console.log('\n── 8. DOM-halvdelen, målt gennem den RIGTIGE index.html ──');
// 🔴 Cellerne rammer gennem kilden, ikke gennem en kopi af logikken. Funktionerne
//    lever i et `<script type="module">` og kan ikke importeres, så fragmentet
//    UDTRÆKKES og evalueres. En kopi her ville kunne drive fra fladen tavst.
{
  const START = 'let q17ApiBase';
  const SLUT  = 'function startForm()';
  const i0 = kilde.indexOf(START), i1 = kilde.indexOf(SLUT);
  if (i0 < 0) doed('kunne ikke finde "' + START + '" i index.html');
  if (i1 < 0 || i1 < i0) doed('kunne ikke finde "' + SLUT + '" efter modulet');
  const fragment = kilde.slice(i0, i1);
  for (const n of ['q17AnvendNavn', 'q17HentKendt', 'q17Muligt']) {
    if (!fragment.includes('function ' + n)) doed('udtrækket manglede ' + n + '()');
  }

  // Minimal DOM. Bevidst dum: den kan kun det fladen faktisk bruger, så en ny
  // DOM-afhængighed i index.html får denne prøve til at KASTE frem for at tie.
  const lavDom = () => {
    const lyttere = [];
    const input = { id: 'patient-name', value: '', readOnly: false, focus() {}, _efter: null,
                    insertAdjacentElement(_pos, el) { this._efter = el; } };
    const label = { textContent: 'Dit navn (valgfrit)' };
    const blok = { hidden: false, _ret: null,
                   querySelector(sel) { return sel === 'label' ? label : (sel === '.q17-ret' ? blok._ret : null); } };
    const document = {
      querySelector(sel) { return sel === '.patient-info' ? blok : null; },
      getElementById(id) { return id === 'patient-name' ? input : null; },
      createElement() { const el = { hidden: false, textContent: '', type: '', className: '',
        addEventListener(_e, f) { lyttere.push(f); } }; blok._ret = el; return el; },
    };
    return { document, input, label, blok, klikRet: () => lyttere.forEach((f) => f()) };
  };
  const kald = (svar) => {
    const d = lavDom();
    const f = new Function('document', 'q17Dom', 'q17NavneHandling', 'console',
      fragment + '\n;return q17AnvendNavn(arguments[4]);');
    const h = f(d.document, q17Dom, q17NavneHandling, { warn() {} }, svar);
    return { ...d, handling: h };
  };

  {
    const r = kald({ ok: true, felter: { navn: { tilstand: 'paalidelig', vaerdi: 'Anne Hansen' } } });
    ok(r.handling === 'spring' && r.blok.hidden === true, 'spring: spørgsmålet forsvinder fra fladen');
    ok(r.input.value === 'Anne Hansen', 'spring: SVARET bliver stående i feltet',
       'ellers står clientName tom, og navne-fallback i MentemSyncService.swift:201 har intet at matche på');
  }
  {
    const r = kald({ ok: true, felter: { navn: { tilstand: 'lav', vaerdi: 'Ane Hanssen' } } });
    ok(r.handling === 'bekraeft' && r.blok.hidden === false, 'bekræft: blokken bliver stående');
    ok(r.label.textContent === 'Er det dig?', 'bekræft: labelen spørger ikke forfra');
    ok(r.input.value === 'Ane Hanssen' && r.input.readOnly === true, 'bekræft: navnet vises, låst');
    ok(r.input._efter && r.input._efter.textContent === 'Ret', 'bekræft: der er en Ret-knap');
    r.klikRet();
    ok(r.input.readOnly === false && r.input._efter.hidden === true, 'bekræft: Ret låser feltet op');
  }
  {
    const r = kald({ ok: true, felter: { navn: { tilstand: 'ukendt', vaerdi: null } } });
    ok(r.handling === 'spoerg' && r.blok.hidden === false && r.input.value === '',
       'spørg: feltet står præcis som før Q17 fandtes');
  }
  {
    const r = kald({ ok: true, felter: { navn: { tilstand: 'paalidelig', vaerdi: 'Anne Hansen' },
                                         cpr:  { tilstand: 'paalidelig', vaerdi: '0101801234' } } });
    ok(r.handling === 'spoerg' && r.blok.hidden === false, 'CPR i svaret: fladen skjuler INTET');
    ok(r.input.value === '' && !/0101801234/.test(JSON.stringify(r.input)),
       'CPR i svaret: intet af svaret når DOM\'en');
  }
  {
    const r = kald(null);
    ok(r.handling === 'spoerg' && r.blok.hidden === false, 'dødt opslag: feltet står, klienten mærker intet');
  }
  // Fladen må ikke spørge nogen uden BÅDE token og base.
  const g = (navn, tok, base) => {
    const f = new Function('ingestToken', 'q17base', fragment + '\n;q17ApiBase = q17base; return q17Muligt();');
    ok(f(tok, base) === false, navn);
  };
  g('uden token: der spørges ingen', '', 'https://x');
  g('uden base (i dag): der spørges ingen', 'v1.a.1.b.c', '');
  {
    const f = new Function('ingestToken', 'q17base', fragment + '\n;q17ApiBase = q17base; return q17Muligt();');
    ok(f('v1.a.1.b.c', 'https://x') === true, 'POS-KTRL: med begge dele VILLE der blive spurgt');
  }
}

// ── MUTANTER ────────────────────────────────────────────────────────────────────
if (process.argv.includes('--selftest')) {
  console.log('\n── selvtest: kan cellerne overhovedet fejle ──');
  let i = 0, draebt = 0;
  const mut = (navn, celle) => {
    i++;
    let overlevede = false;
    try { overlevede = celle() === true; } catch (e) { overlevede = false; }
    if (overlevede) { console.log('    ✗ mutant ' + i + ' (' + navn + ') OVERLEVEDE'); fejl++; }
    else { console.log('    ✓ mutant ' + i + ' (' + navn + ') draebt'); draebt++; }
  };
  // 🔴 Mutanterne bryder KILDEN, ikke en kopi af reglen. En mutant der overlever,
  //    betyder at cellen ovenfor ikke kunne se forskel på rigtigt og forkert.
  const KILDE = readFileSync(join(HER, '..', 'index.html'), 'utf8');
  const FRAG = KILDE.slice(KILDE.indexOf('let q17ApiBase'), KILDE.indexOf('function startForm()'));
  const domStub = () => {
    const input = { value: '', readOnly: false, focus() {}, insertAdjacentElement(_p, el) { this._efter = el; } };
    const label = { textContent: 'x' };
    const blok = { hidden: false, _ret: null, querySelector(sel) { return sel === 'label' ? label : blok._ret; } };
    return { input, blok, document: {
      querySelector: (sel) => (sel === '.patient-info' ? blok : null),
      getElementById: () => input,
      createElement: () => { const el = { hidden: false, addEventListener() {} }; blok._ret = el; return el; },
    } };
  };
  const mutFrag = (navn, frag, svar, celle) => mut(navn, () => {
    const d = domStub();
    const f = new Function('document', 'q17Dom', 'q17NavneHandling', 'console',
      frag + '\n;return q17AnvendNavn(arguments[4]);');
    const h = f(d.document, q17Dom, q17NavneHandling, { warn() {} }, svar);
    return celle({ ...d, handling: h });
  });
  // mutant 1: spring skjuler spørgsmålet men glemmer at bære svaret med.
  mutFrag('spring uden at fylde feltet', FRAG.replace('input.value = h.vaerdi;\n    blok.hidden = true;', 'blok.hidden = true;'),
          { ok: true, felter: { navn: { tilstand: 'paalidelig', vaerdi: 'Anne Hansen' } } },
          (r) => r.handling === 'spring' && r.input.value === 'Anne Hansen');
  // mutant 2: bekræft-grenen låser ikke, så et vist navn kan sendes uændret uden at nogen så det.
  mutFrag('bekræft låser ikke feltet', FRAG.replace('input.readOnly = true;', 'input.readOnly = false;'),
          { ok: true, felter: { navn: { tilstand: 'lav', vaerdi: 'Ane Hanssen' } } },
          (r) => r.handling === 'bekraeft' && r.input.readOnly === true);
  // mutant 3: værdikravet i kernen fjernes -> pålidelig uden værdi springer over.
  mut('kernen springer over uden en værdi', () => {
    const uden = (post) => (post.tilstand === 'paalidelig' ? 'spring' : 'spoerg');
    return uden({ tilstand: 'paalidelig', vaerdi: '' }) === q17FeltDom('navn', { tilstand: 'paalidelig', vaerdi: '' }).handling;
  });
  // mutant 4: tilladelseslisten åbnes -> CPR ville nå fladen.
  mut('tilladelseslisten rummer cpr', () => ['navn', 'cpr'].includes('cpr') === false);
  console.log('  mutanter: ' + i + ' · draebt ' + draebt);
}

console.log(fejl === 0 ? '\n🟢 q17-kendt-kontrakt: alt groent' : '\n🔴 q17-kendt-kontrakt: ' + fejl + ' fejl');
process.exit(fejl === 0 ? 0 : 1);
