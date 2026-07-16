// copy-guard.mjs — VERA-guard #2: sprogguard på SYNLIG KLIENT-COPY.
//
// HVORFOR: 16/7 fangede Viktor TRE gange på én dag samme sprogfejl i klient-copy som INGEN
// guard fanger ("engangs-skema", "søvn-svar"). Ingen af dem var em-dash: det var en
// ANGLICISTISK BINDESTREG i et sammensat ord, som Iowan Old Style tegner så lang at den
// LIGNER en em-dash. Viktors nudansk-regel (27/6): "dansk skriver sammensatte ord i ÉT ord
// (terapiforløb, bekymringssammenligning, IKKE terapi-forløb)". Den regel var HELT ubevogtet.
// `test/emoji-guard.mjs` bar kun en 1-mønsters NUDANSK_FORBUDT-liste (oplæsnings-venlig) =
// en efterrationaliserings-liste, ikke en guard: den fanger kun det vi allerede har fundet.
//
// HVORFOR EN NY GUARD OG IKKE BARE "+index.html" I DEN GAMLE:
// emoji-guard scanner RÅ BYTES linje for linje. index.html — den STØRSTE klientflade — bærer
// 69 em-dash, hvoraf 61 i //-kommentarer og resten i <!-- -->; en rå-scan ville fejle på tekst
// INGEN klient ser. Derfor stod index.html uden em-dash-guard (EMDASH_GUARDED_FILES = kun
// core.js + anmod.html). Denne guard vender problemet om: den EKSTRAHERER først det klienten
// FAKTISK ser (HTML-tekstnoder + tekst-attributter + JS-strengliteraler) og scanner KUN det.
// Så kan index.html endelig guardes. (Verificeret 16/7: 0 em-dash i index.htmls synlige copy —
// filen var ren, bare ubeskyttet.)
//
// FORHOLD TIL emoji-guard.mjs: den beholder rå-byte-scan for emoji (emoji i en kommentar er
// harmløs, men rå-scan dér er billig og har 0 falske positive i praksis). Denne guard er
// additiv og overlapper bevidst på em-dash for de 2 filer den gamle allerede dækker — to
// uafhængige beviser på samme regel er en feature, ikke gæld.
//
// Kør standalone:  node test/copy-guard.mjs        (exit 0 = grøn, 1 = regression)
// Tester:          node test/copy-guard-test.mjs

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// ── SCOPE — hele den faktiske klient-facing prod-flade ───────────────────────
// index.html = søvndagbog/skema-host (STØRST, tidligere uguardet for em-dash).
// mentem-skema-core.js = skema-render-motoren (labels/options -> DOM).
// anmod.html = forløbs-anmodnings-formular. Bevidst UDE: *-preview.html / *-mock.html
// (ikke prod-klient-UI), *.json (data, ikke UI-streng).
export const COPY_GUARDED_FILES = ['index.html', 'mentem-skema-core.js', 'anmod.html'];

// ── REGEL 1+2: em-dash og en-dash i synlig copy ──────────────────────────────
// Em-dash "—" (U+2014) = tydeligt AI-tegn, forbudt i AL klient-copy (Viktor 19/6).
// En-dash "–" (U+2013) tages med her fordi den er em-dashens snigende fætter: i Iowan Old
// Style er de næsten ikke til at skelne, og en en-dash brugt som TANKESTREG er samme fejl.
// UNDTAGELSE: en-dash mellem TAL er korrekt dansk typografi for intervaller ("0–100 %",
// "kl. 9–17") — se NUMERIC_EN_DASH nedenfor. Em-dash har ingen tilsvarende undtagelse.
const EM_DASH = '—';
const EN_DASH = '–';
// Talinterval: en-dash med tal (evt. med decimaler) på begge sider = interval, ikke tankestreg.
const NUMERIC_EN_DASH = /(?<=\d\s?)–(?=\s?\d)/;

// ── REGEL 3: anglicistisk bindestreg i sammensat ord ─────────────────────────
// Mønster: mindst 3 SMÅ bogstaver + "-" + mindst 3 SMÅ bogstaver. Kravet om SMÅ bogstaver
// på BEGGE sider er ikke kosmetik — det er selve præcisionen, og det gør størstedelen af
// Viktors "lovlige bindestreg"-liste til en STRUKTUREL undtagelse i stedet for allowlist-
// gæld (en allowlist man ikke behøver, kan ikke rådne):
//   · "GAD-7", "PHQ-9", "CAS-1", "uge 1-3", "kl. 9-05"  -> tal efter "-"        = matcher ikke
//   · "STOP-Bang", "Stanley-Brown", "Jacobson-Truax"     -> VERSAL efter "-"     = matcher ikke
//   · "ind- og udånding", "søvn- og vågenmønster"        -> mellemrum efter "-"  = matcher ikke
//   · "e-mail", "u-land"                                 -> <3 tegn før "-"      = matcher ikke
// Tilbage står præcis det anglicistiske tilfælde: to danske ORD limet med bindestreg.
// Bemærk at "Søvndagbog-opdatering" FANGES via sit lille-bogstavs-løb ("øvndagbog-opdatering")
// — derfor rapporteres `found` som det matchede løb; se `describe()`.
const KOMPOSITUM = /[a-zæøå]{3,}-[a-zæøå]{3,}/g;

// ── ALLOWLIST — lovlige bindestreger der TRODS mønstret er korrekt dansk ─────
// Viktors regel har reelle undtagelser (Retskrivningsordbogen §57). De fleste er dækket
// strukturelt ovenfor; DENNE liste er kun til dem der faktisk matcher mønstret.
//
// HÅRD REGEL: hver post SKAL bære en begrundelse. En allowlist uden begrundelser er en
// skraldespand — den næste læser kan ikke se forskel på "bevidst undtagelse" og "nogen
// havde travlt", og så vokser den til guarden er værdiløs. Tilføj KUN med kilde/argument.
// Posten matches mod hele det synlige copy-segment (ikke kun det matchede løb), så
// konteksten kan indgå.
export const BINDESTREG_ALLOWLIST = [
  // Domæner/e-mail/URL'er: bindestreg er en del af en TEKNISK IDENTIFIKATOR, ikke en dansk
  // sammensætning — den må ikke "rettes" til ét ord uden at adressen holder op med at virke.
  { re: /\b[\w.-]+\.(dk|com|net|org|io)\b/, why: 'domæne/URL: bindestreg er del af adressen, ikke en sammensætning' },
  { re: /\b[\w.-]+@[\w.-]+\b/, why: 'e-mailadresse: teknisk identifikator' },
  // Filnavne klienten ser (download-navn): samme argument som domæner.
  { re: /\b[\w-]+\.(json|js|pdf|csv|html)\b/, why: 'filnavn: teknisk identifikator, ikke prosa' },
];

// ── PENDING — REELLE fund i shippet copy, der AFVENTER Viktor-GO ─────────────
// Guarden fandt disse 16/7 ved sin første kørsel mod den faktiske flade. De er ÆGTE
// nudansk-fejl, ikke falske positive. De er IKKE rettet her, fordi klient-copy er
// Viktor-godkendt territorium: en guard-opgave må ikke smugle ordlyds-ændringer med ind
// (det ville også gøre guarden umulig at stole på — "retter den bare mine ord?").
//
// DETTE ER IKKE EN ALLOWLIST. Forskellen er hård og mekanisk håndhævet:
//   · en allowlist siger "dette er korrekt"      -> lever for evigt
//   · denne liste siger "dette er FORKERT, endnu ikke rettet" -> skal DØ
// runCopyGuard() FEJLER hvis en post her IKKE længere findes i fladen (se `stale` nedenfor).
// Når Viktor godkender rettelsen, SKAL posten slettes, ellers bliver suiten rød. Listen kan
// derfor kun krympe — den kan ikke blive den skraldespand en ubegrundet allowlist bliver.
export const PENDING_VIKTOR_GO = [
  { file: 'index.html', found: 'øvndagbog-opdatering', forslag: 'Søvndagbogsopdatering',
    note: 'delings-/mailemne klienten ser: "Søvndagbog-opdatering til min psykolog"' },
  { file: 'anmod.html', found: 'test-visning', forslag: 'testvisning', note: 'forhåndsvisnings-banner (TEST_HOST)' },
  { file: 'anmod.html', found: 'anmod-formularen', forslag: 'anmodformularen', note: 'forhåndsvisnings-banner (TEST_HOST)' },
  { file: 'anmod.html', found: 'ingest-worker', forslag: 'ingestworker (eller omskriv: "worker\'en til modtagelse")',
    note: 'forhåndsvisnings-banner; desuden internt begreb i klient-copy' },
  { file: 'anmod.html', found: 'sykiater-henvisning', forslag: 'Psykiaterhenvisning',
    note: 'SHIPPET fejlbesked: "Psykiater-henvisning kan kun vælges, når du er henvist via egen læge."' },
  { file: 'anmod.html', found: 'server-forbindelse', forslag: 'serverforbindelse', note: 'forhåndsvisnings-kvittering (TEST_HOST)' },
];

// Per-linje-markør til éngangs-undtagelser der ikke fortjener en global regel.
// KRÆVER begrundelse efter kolon (samme rationale som allowlisten ovenfor).
const ALLOW_MARKER = /nudansk-guard:allow:\s*\S+/;

// Instrument-sentineller (GENBRUGT fra emoji-guard, samme konvention): validerede kliniske
// instrumenter (GAD-7, PHQ-9, WHO-5, WSAS, CSD) gengives VERBATIM fra kilden. Fidelity slår
// stil (Viktor 19/6) — vi må IKKE nudanske os til en anden måling end den validerede.
const INSTRUMENT_START = 'emdash-guard:instrument-start';
const INSTRUMENT_END = 'emdash-guard:instrument-end';

// Tekst-bærende attributter: skærmlæseren læser dem HØJT -> de ER klient-copy. Resten
// (class/id/data-*/src/style) er DOM-plumbing og aldrig tekst.
const TEXT_ATTRS = ['aria-label', 'aria-description', 'placeholder', 'title', 'alt', 'aria-placeholder'];

// ── Parse-fejl skal larme ────────────────────────────────────────────────────
// "Ingen silent caps": kan vi ikke parse, må vi ALDRIG bare springe filen over — en guard
// der tavst ikke tjekker er værre end ingen guard, fordi den køber tryghed uden dækning.
export class CopyGuardParseError extends Error {}

// ── JS-tokenizer -> strengliteraler ──────────────────────────────────────────
// HVORFOR EN RIGTIG TOKENIZER (og ikke en regex): en naiv /'([^']*)'/-scan DESYNKRONISERER
// på denne flade — en apostrof inde i en template-literal åbner en falsk streng der løber
// til næste apostrof i KODEN, hvorefter guarden "scanner" rå JS som var det copy (målt 16/7:
// den slæbte hele funktionskroppe med ind). Det giver både falske positive og — værre —
// falske negative. Tokenizeren holder styr på: linje/blok-kommentar, ' " `, ${}-interpolation
// (med nesting), og regex-literaler. Template-quasis samles med interpolationerne fjernet, så
// `<div class="${x}">tekst</div>` igen er velformet markup der kan tag-strippes.
function tokenizeStrings(src, file) {
  const out = [];
  let i = 0, line = 1, prev = '';
  const N = src.length;
  while (i < N) {
    const c = src[i];
    if (c === '\n') { line++; i++; continue; }
    if (c === '/' && src[i + 1] === '/') { while (i < N && src[i] !== '\n') i++; continue; }
    if (c === '/' && src[i + 1] === '*') {
      i += 2;
      while (i < N && !(src[i] === '*' && src[i + 1] === '/')) { if (src[i] === '\n') line++; i++; }
      if (i >= N) throw new CopyGuardParseError(`${file}: uafsluttet blok-kommentar fra linje ${line}`);
      i += 2; continue;
    }
    // Regex-literal vs division: afgøres af forrige betydende tegn.
    if (c === '/' && (prev === '' || /[=(,:[!&|?{};+\-*%~^]/.test(prev))) {
      const start = line; i++; let cls = false, closed = false;
      while (i < N) {
        const d = src[i];
        if (d === '\\') { i += 2; continue; }
        if (d === '[') cls = true;
        else if (d === ']') cls = false;
        else if (d === '/' && !cls) { i++; closed = true; break; }
        else if (d === '\n') break;
        i++;
      }
      if (!closed) throw new CopyGuardParseError(`${file}: uafsluttet regex-literal på linje ${start}`);
      while (i < N && /[a-z]/.test(src[i])) i++;
      prev = '/'; continue;
    }
    if (c === '"' || c === "'") {
      const q = c, start = line, open = i; i++; let buf = '', closed = false;
      while (i < N) {
        if (src[i] === '\\') { buf += src[i + 1] === 'n' ? '\n' : src[i + 1]; i += 2; continue; }
        if (src[i] === q) { closed = true; i++; break; }
        if (src[i] === '\n') break; // ' og " må ikke spænde linjer
        buf += src[i++];
      }
      if (!closed) throw new CopyGuardParseError(`${file}: uafsluttet streng (${q}) på linje ${start}`);
      // `before` måles fra det ÅBNENDE anførselstegn (ikke fra buf.length: escapes gør
      // buf kortere end kilden, og et forskudt kaldested-vindue = ubrugelig klassifikation).
      out.push({ text: buf, line: start, before: src.slice(Math.max(0, open - 60), open) });
      prev = 'x'; continue;
    }
    if (c === '`') {
      const start = line, open = i; i++; let buf = '', depth = 0, closed = false;
      while (i < N) {
        if (depth === 0 && src[i] === '`') { closed = true; i++; break; }
        if (depth === 0 && src[i] === '\\') { buf += src[i + 1]; i += 2; continue; }
        if (depth === 0 && src[i] === '$' && src[i + 1] === '{') { depth = 1; i += 2; continue; }
        if (depth > 0) { // spring interpolation over — den er KODE, ikke copy
          const d = src[i];
          if (d === '{') depth++;
          else if (d === '}') depth--;
          else if (d === '"' || d === "'" || d === '`') {
            const q2 = d; i++;
            // Newlines i en sprunget-over streng skal STADIG med i buf (se nedenfor).
            while (i < N && src[i] !== q2) { if (src[i] === '\\') i++; if (src[i] === '\n') { line++; buf += '\n'; } i++; }
          } else if (d === '\n') { line++; buf += '\n'; }
          // HVORFOR buf += '\n' for sprungne newlines: buf'ens linje-struktur skal spejle
          // KILDENS 1:1, ellers peger linje+idx forkert. En interpolation over 3 linjer ville
          // ellers "spise" 3 newlines, og alt efter den i samme template rykkede 3 linjer op
          // (målt mod Viktors 16/7-fejl: rapporteret 1501, faktisk 1498).
          i++; continue;
        }
        if (src[i] === '\n') line++;
        buf += src[i++];
      }
      if (!closed) throw new CopyGuardParseError(`${file}: uafsluttet template-literal fra linje ${start}`);
      out.push({ text: buf, line: start, before: src.slice(Math.max(0, open - 60), open) });
      prev = 'x'; continue;
    }
    if (!/\s/.test(c)) prev = c;
    i++;
  }
  return out;
}

// ── Er strengen DOM-plumbing frem for copy? ──────────────────────────────────
// Afgøres på KALDESTEDET, ikke på strengens udseende. Det er med vilje: en formbaseret
// regel ("kun små bogstaver og bindestreger = klassenavn") ville udelukke præcis den copy
// vi jagter ("engangs-skema sendt" ser formmæssigt ud som en className-liste). Kaldestedet
// er derimod et FAKTUM om hvorvidt strengen nogensinde bliver tekst for klienten.
const PLUMBING_CALLSITE = /(?:querySelector(?:All)?|getElementById|getElementsByClassName|closest|matches|classList\.(?:add|remove|toggle|contains|replace)|setAttribute\(\s*['"](?:class|id|style|src|href|data-[\w-]*)['"]|fetch|import|URL|createElement|insertAdjacentHTML|\.(?:className|id|src|href|cssText|dataset\.\w+)\s*=|getItem|setItem|removeItem|JSON\.parse)\s*\(?\s*$/;
// CSS-deklarationsblok ("border-radius:7px;font-size:13px") — styling, aldrig tekst.
const CSS_DECL = /^\s*[a-z-]+\s*:\s*[^;{}]*(?:;\s*[a-z-]+\s*:\s*[^;{}]*)*;?\s*$/;
// Bare identifikator/selektor-liste uden prosa ("diary-field", ".a, .b", "#x p",
// "h1, h2, .intro, label.diary-q"). Tokens må bære indre '.' (type+klasse) og [attr="v"].
const SELECTOR_TOKEN = /[.#]?[\w-]+(?:[.#][\w-]+)*(?:\[[\w-]+(?:[~^|*$]?=["']?[\w-]+["']?)?\])*/;
const SELECTOR_ONLY = new RegExp(`^\\s*${SELECTOR_TOKEN.source}(?:[\\s,>+~]+${SELECTOR_TOKEN.source})*\\s*$`);
// Sti/URL/endpoint: indeholder '/' og INTET mellemrum -> teknisk adresse, aldrig prosa.
// (Fanger `${base}/api/soevn-draft/${token}` efter interpolations-fjernelse.)
const PATH_LIKE = /^\s*[^\s]*\/[^\s]*\s*$/;

function isPlumbing(lit) {
  const t = lit.text;
  if (!t.trim()) return true;
  if (CSS_DECL.test(t)) return true;
  if (PATH_LIKE.test(t)) return true;
  if (PLUMBING_CALLSITE.test(lit.before)) return true;
  // Selektor-agtigt OG uden dansk prosa-tegn: en selektor bærer aldrig æøå/versaler+punktum.
  if (SELECTOR_ONLY.test(t) && !/[æøåÆØÅ]/.test(t) && !/[.!?]\s/.test(t)) return true;
  return false;
}

// ── Ekstrahér den copy klienten FAKTISK ser ──────────────────────────────────
// Returnerer [{ text, line, origin }]. Kaster CopyGuardParseError hvis filen ikke kan parses.
export function extractVisibleCopy(text, file = '<input>') {
  const segments = [];
  // Filtypen afgør parsing — IKKE indholdet. En "ligner-det-HTML?"-sniff er direkte farlig
  // her: mentem-skema-core.js bygger markup i template-strenge, så en sniff på "<div" ville
  // parse JS som HTML og udgive filens KOMMENTARER for klient-copy (målt: 380+ falske
  // positive). Ukendt filtype -> larm, så en ny flade aldrig lander tavst uguardet.
  if (!/\.(html|js|mjs)$/.test(file)) {
    throw new CopyGuardParseError(`${file}: ukendt filtype — copy-guard ved ikke hvordan den udtrækker synlig copy her. Tilføj en parser frem for at springe filen over.`);
  }
  const isHtml = /\.html$/.test(file);

  // Instrument-regioner FØRST (sentinellerne lever i kommentarer, som strippes senere).
  const inInstrument = new Set();
  {
    let on = false;
    text.split('\n').forEach((ln, idx) => {
      if (ln.includes(INSTRUMENT_START)) { on = true; return; }
      if (ln.includes(INSTRUMENT_END)) { on = false; return; }
      if (on) inInstrument.add(idx + 1);
    });
  }
  // Linjer med en begrundet allow-markør.
  const allowed = new Set();
  text.split('\n').forEach((ln, idx) => { if (ALLOW_MARKER.test(ln)) allowed.add(idx + 1); });

  const skip = (line) => inInstrument.has(line) || allowed.has(line);
  const push = (t, line, origin) => { if (t && t.trim() && !skip(line)) segments.push({ text: t, line, origin }); };

  let jsSrc = '', jsLineBase = 0;

  if (isHtml) {
    const lines = text.split('\n');
    // Linjenummer-bevarende strip: erstat ikke-newline-tegn med mellemrum.
    const blank = (s) => s.replace(/[^\n]/g, ' ');
    let s = text.replace(/<!--[\s\S]*?-->/g, blank);        // kommentarer renderer ikke
    if (/<!--/.test(s)) throw new CopyGuardParseError(`${file}: uafsluttet HTML-kommentar`);
    s = s.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, blank); // CSS er ikke tekst

    // <script>-indhold: tokeniseres som JS (linjenumre bevares via blanking).
    const scriptRe = /<script[^>]*>([\s\S]*?)<\/script>/gi;
    let m, scriptSrc = '';
    while ((m = scriptRe.exec(s)) !== null) {
      const before = s.slice(0, m.index);
      const startLine = before.split('\n').length + (m[0].slice(0, m[0].indexOf('>') + 1).split('\n').length - 1);
      scriptSrc += '\n'.repeat(Math.max(0, startLine - scriptSrc.split('\n').length)) + m[1];
    }
    jsSrc = scriptSrc; jsLineBase = 0;
    s = s.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, blank);

    // Tekst-attributter (skærmlæser-copy) FØR tag-strip.
    const attrRe = new RegExp(`\\b(${TEXT_ATTRS.join('|')})\\s*=\\s*"([^"]*)"|\\b(${TEXT_ATTRS.join('|')})\\s*=\\s*'([^']*)'`, 'gi');
    while ((m = attrRe.exec(s)) !== null) {
      const line = s.slice(0, m.index).split('\n').length;
      push(m[2] ?? m[4], line, 'attr');
    }
    // Tekstnoder = alt uden for tags.
    s.replace(/<[^>]*>/g, blank).split('\n').forEach((ln, idx) => push(decodeEntities(ln), idx + 1, 'text'));
    void lines;
  } else {
    jsSrc = text;
  }

  for (const lit of tokenizeStrings(jsSrc, file)) {
    if (isPlumbing(lit)) continue;      // klassificér på HELE literalen (kaldestedet gælder den)
    // JS-strenge bygger ofte markup -> tag-strip så kun tekstnoder står tilbage.
    let t = stripTagsKeepLines(lit.text);
    if (/[<>]/.test(t)) t = blankKeepLines(t, /<[\s\S]*$/).replace(/^[^\n]*>/, (m) => ' '.repeat(m.length));
    // Én multi-linje-literal = ÉN linje ville pege forkert: en template-literal på 30 linjer
    // ville rapportere fejlen på sin ÅBNINGSLINJE og vise en nabosætning som `raw`. Målt mod
    // Viktors egen 16/7-fejl: 9 linjer ved siden af. En guard der peger forkert bliver ignoreret.
    t.split('\n').forEach((ln, idx) => push(decodeEntities(ln), lit.line + jsLineBase + idx, 'js'));
  }
  return segments;
}

// Tag-strip der BEVARER linjenumre: et tag erstattes af lige så mange mellemrum, og dets
// newlines beholdes. (En almindelig .replace(/<[^>]*>/g,' ') æder newlines inde i multi-linje-
// tags -> alt efterfølgende rykker op, og guarden peger på den forkerte linje.)
function stripTagsKeepLines(s) {
  return s.replace(/<[^>]*>/g, (m) => m.replace(/[^\n]/g, ' '));
}
function blankKeepLines(s, re) {
  return s.replace(re, (m) => m.replace(/[^\n]/g, ' '));
}

function decodeEntities(s) {
  return s.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&mdash;/g, EM_DASH).replace(/&ndash;/g, EN_DASH);
}

function allowlisted(segmentText, hit) {
  for (const a of BINDESTREG_ALLOWLIST) {
    // Match mod hele segmentet, men kun hvis fundet ligger inde i det allowlistede udtryk.
    const m = segmentText.match(a.re);
    if (m && m[0].includes(hit)) return a;
  }
  return null;
}

// Foreslå rettelsen: "engangs-skema" -> "engangsskema".
function foreslaa(hit) { return hit.replace('-', ''); }

// ── Kerne-scanner ────────────────────────────────────────────────────────────
export function scanCopy(text, file = '<input>') {
  const violations = [];
  for (const seg of extractVisibleCopy(text, file)) {
    if (seg.text.includes(EM_DASH)) {
      violations.push({
        file, line: seg.line, kind: 'em-dash', found: EM_DASH,
        fix: 'brug komma/punktum/kolon/parentes i stedet',
        why: 'em-dash er et tydeligt AI-tegn og er forbudt i al klient-copy (Viktor 19/6)',
        raw: seg.text.trim().slice(0, 120),
      });
    }
    if (seg.text.includes(EN_DASH)) {
      // Talinterval ("0–100 %") er korrekt dansk typografi -> kun tankestregs-brug fanges.
      const uden = seg.text.replace(new RegExp(NUMERIC_EN_DASH.source, 'g'), '');
      if (uden.includes(EN_DASH)) {
        violations.push({
          file, line: seg.line, kind: 'en-dash', found: EN_DASH,
          fix: 'brug komma/punktum/kolon (eller behold hvis det er et talinterval)',
          why: 'en-dash brugt som tankestreg ligner em-dash i Iowan Old Style og er samme fejl',
          raw: seg.text.trim().slice(0, 120),
        });
      }
    }
    for (const hit of seg.text.match(KOMPOSITUM) || []) {
      const allow = allowlisted(seg.text, hit);
      if (allow) continue;
      violations.push({
        file, line: seg.line, kind: 'bindestreg', found: hit,
        fix: `${hit} → ${foreslaa(hit)}`,
        why: 'dansk skriver sammensatte ord i ét ord (nudansk-direktiv 27/6); den lange bindestreg i Iowan Old Style ligner desuden en em-dash',
        raw: seg.text.trim().slice(0, 120),
      });
    }
  }
  return violations;
}

export function scanCopyFile(relPath) {
  const text = readFileSync(join(REPO_ROOT, relPath), 'utf8');
  if (!text.trim()) throw new CopyGuardParseError(`${relPath}: tom fil — guarden nægter at rapportere grønt på ingenting`);
  return scanCopy(text, relPath);
}

// Splitter fund i { nye, pending } og fanger STALE pending-poster.
// `nye` = det guarden skal fejle på. `pending` = kendte, endnu ikke-godkendte rettelser.
// `stale` = poster i PENDING_VIKTOR_GO der ikke længere findes -> også en FEJL: listen skal
// dø når fladen rettes, ellers er den ved at blive en allowlist i forklædning.
export function triageCopy(violations, pending = PENDING_VIKTOR_GO) {
  const brugt = new Set();
  const nye = [];
  for (const v of violations) {
    const idx = pending.findIndex((p) => p.file === v.file && p.found === v.found);
    if (idx === -1) nye.push(v);
    else brugt.add(idx);
  }
  const stale = pending.filter((_, i) => !brugt.has(i));
  return { nye, stale, pendingFundet: violations.length - nye.length };
}

export function runCopyGuard(files = COPY_GUARDED_FILES) {
  return files.flatMap(scanCopyFile);
}

// ── Standalone CI-hook ───────────────────────────────────────────────────────
function isMain() {
  return process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
}

if (isMain()) {
  let violations;
  try {
    violations = runCopyGuard();
  } catch (e) {
    // Parse-fejl = rødt, ALDRIG "sprunget over".
    console.error(`copy-guard ✗ - KAN IKKE PARSE: ${e.message}`);
    console.error('En guard der tavst ikke tjekker er værre end ingen guard. Fiks parsingen.');
    process.exit(1);
  }
  const { nye, stale, pendingFundet } = triageCopy(violations);

  if (stale.length) {
    console.error(`copy-guard ✗ - ${stale.length} STALE post(er) i PENDING_VIKTOR_GO (findes ikke længere i fladen):`);
    for (const p of stale) console.error(`  ${p.file}: "${p.found}" — rettet? SLET posten fra listen.`);
    process.exit(1);
  }
  if (nye.length === 0) {
    console.log(`copy-guard ✓ - 0 NYE em-dash/en-dash/anglicistisk bindestreg i synlig copy (${COPY_GUARDED_FILES.join(', ')})`);
    if (pendingFundet) {
      console.log(`copy-guard ⚠ - ${pendingFundet} KENDT fund afventer Viktor-GO på copy-rettelse (PENDING_VIKTOR_GO):`);
      for (const p of PENDING_VIKTOR_GO) console.error(`  ${p.file}: "${p.found}" → ${p.forslag}   (${p.note})`);
    }
    process.exit(0);
  }
  console.error(`copy-guard ✗ - ${nye.length} NY sprog-regression(er) i synlig klient-copy:`);
  for (const v of nye) {
    console.error(`  ${v.file}:${v.line}  [${v.kind}]  ${v.fix}`);
    console.error(`      HVORFOR: ${v.why}`);
    console.error(`      COPY:    "${v.raw}"`);
  }
  console.error(`\nEr fundet bevidst og korrekt? Tilføj "nudansk-guard:allow: <begrundelse>" på linjen`);
  console.error(`(begrundelse er PÅKRÆVET), eller en post i BINDESTREG_ALLOWLIST med kilde.`);
  process.exit(1);
}
