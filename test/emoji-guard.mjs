// emoji-guard.mjs — VERA-guard #1: emoji/glyf-regressions-detektor for klient-facing web-UI.
//
// HVORFOR: 15/6 shippede vi søvndagbog til prod (c9fcaab) med 0 RENDERET emoji — 5 egne
// house-style SVG-ikoner erstattede 🔊🔒✅🌙🔎 (+ Q10-substans 💊🍷☕). Den gevinst er
// mekanisk ubeskyttet: næste commit kan re-introducere en emoji-som-ikon uopdaget. Denne
// guard fryser reglen: FEJLER (exit≠0) hvis et emoji-codepoint optræder i klient-facing,
// RENDERET tekst. Kilde: handoff-emoji-retro-batch-2026-06-15.md + Ikon/emoji-direktiv
// (CLAUDE.md 3/6: "ingen emojis i produkt-UI — altid vores EGNE custom ikoner").
//
// REGEL = "0 emoji SOM IKON" — IKKE "0 emoji nogensinde". Se ALLOWLIST nedenfor.
//
// Kør standalone (CI-hook):  node test/emoji-guard.mjs        (exit 0 = grøn, 1 = regression)
// Importeres også af test/selftest.mjs (foldet ind i den fulde suite).

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// ── SCOPE — KUN faktiske klient-facing prod-flader ──────────────────────────
// index.html = søvndagbog/skema-host. mentem-skema-core.js = skema-render-motoren
// (felt-labels/options injiceres i DOM → klient-facing). Bevidst UDE:
//   soevn-forloeb-preview.html / soevn-hub-mock.html = preview/mock (ikke prod-klient-UI;
//   må gerne bære illustrative emoji). soevn-medicin-seed.json = data, ikke UI-streng.
// anmod.html = forløbs-anmodnings-formular (ANMOD-V1, klient-facing prod-flade).
export const GUARDED_FILES = ['index.html', 'mentem-skema-core.js', 'anmod.html'];

// ── EM-DASH-SCOPE — kun de C4-navngivne filer (anmod-batch v2.1, 2026-06-19) ──
// Em-dash-direktivet er globalt ("ALT vi skriver"), men C4-sweepen i denne batch
// dækker EKSPLICIT kun anmod.html + mentem-skema-core.js. index.html (søvndagbog-
// host) bærer p.t. ~26 em-dashes i shippet klient-copy → en SEPARAT sweep-opgave
// (flagget til Viktor; må ikke balloone anmod-PR'en). Når index.html er ren,
// udvid denne liste til GUARDED_FILES så em-dash-guarden dækker hele fladen.
export const EMDASH_GUARDED_FILES = ['mentem-skema-core.js', 'anmod.html'];

// ── DETEKTÉR — emoji/dingbat brugt SOM IKON ─────────────────────────────────
//   1F000–1FAFF  emoji-pictographs (🔊 1F50A · 🔒 1F512 · 🌙 1F319 · 🔎 1F50E · 💊🍷☕ …)
//   2600–27BF    Misc Symbols + Dingbats (⚠ 26A0 · ☐ 2610 · ✓ 2713 · ✅ 2705 · ✔ 2714 …)
//   2B00–2BFF    Misc Symbols & Arrows (⭐ 2B50 …)
//   FE0F         variation-selector-16 (emoji-presentation-hale på fx ⚠️)
//   203C 2049    ‼ ⁉ (emoji-dobbelttegn)
// BEVIDST UDE (= typografisk prosa, IKKE ikon, derfor tilladt):
//   2190–21FF    pile (→ 2192, ← 2190, ↔) — bruges i knaplabels ("Færdig →") og i hint-
//                prosa ("Indstillinger → Tilgængelighed"). Ikke et lånt ikon.
//   2000–206F    generel tegnsætning (– — • osv.).
const ICON_EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{203C}\u{2049}]/u;
const ICON_EMOJI_G = new RegExp(ICON_EMOJI.source, 'gu');

// ── EM-DASH "—" (U+2014) — forbudt-tegn (Viktor-direktiv 2026-06-19) ─────────
// Em-dash er et tydeligt AI-tegn → forbudt i AL klient-facing copy (CLAUDE.md:
// "ALDRIG '—' i NOGEN tekst vi skriver"). Brug komma/punktum/kolon/parentes/bindestreg.
// Samme comment-strip + allowlist-mekanik som emoji-guard (kommentarer renderer ikke →
// uden for reglen; bevidst-beholdt em-dash markeres med "emdash-guard:allow: <begrundelse>").
// NB: midterprik "·", bindestreg "-" og box-streg "─" er IKKE em-dash → tilladt.
const EMDASH = /—/;
const EMDASH_G = /—/g;
const EMDASH_ALLOW_MARKER = 'emdash-guard:allow';
// Region-undtagelse: validerede/reproducerede kliniske instrumenter (GAD-7/PHQ-9/WHO-5/WSAS-items)
// gengives VERBATIM fra kilden → em-dash-reglen gælder IKKE inden for et instrument-region (CLAUDE.md-
// undtagelse, Viktor 2026-06-19). Markeres med sentinel-kommentarer i kildefilen. Emoji-reglen er
// UPÅVIRKET (instrumenter må fortsat ikke bære emoji). En fremtidig index.html-sweep bruger samme markør.
const EMDASH_INSTRUMENT_START = 'emdash-guard:instrument-start';
const EMDASH_INSTRUMENT_END = 'emdash-guard:instrument-end';

// ── ALLOWLIST — direktivet er "0 emoji SOM IKON", ikke "0 emoji i prosa" ─────
// Bevidst-beholdt emoji i RENDERET tekst (beskrivende prosa, alert-body, fejrings-tekst,
// legitim Psykoedukation osv.) markeres EKSPLICIT på samme linje med:
//
//     … 🎉 …   <!-- emoji-guard:allow: <kort begrundelse> -->     (HTML-flade)
//     '… 🎉 …'  // emoji-guard:allow: <kort begrundelse>           (JS-streng)
//
// Markøren skal bære en begrundelse, så bevidst-beholdt prosa IKKE ligner uafsluttet
// arbejde for en fremtidig læser. (Slugs/ID'er/enum-cases/tags er pr. definition ikke
// emoji-bærende her; skulle det ske, dækker samme markør dem.) Pt. = TOM allowlist:
// nuværende tree har 0 emoji-som-ikon i renderet flade (kun typografiske pile).
const ALLOW_MARKER = 'emoji-guard:allow';

// ── Kommentar-strip (kommentarer RENDERER ikke → uden for reglen) ────────────
// Bevarer linjenumre: blok/HTML-kommentarers ikke-newline-tegn → mellemrum.
function blankButNewlines(s) { return s.replace(/[^\n]/g, ' '); }

function stripBlockAndHtmlComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, blankButNewlines)   // /* … */ (JS + CSS)
    .replace(/<!--[\s\S]*?-->/g, blankButNewlines);    // <!-- … --> (HTML)
}

// Linje-kommentar (// … EOL), citat-bevidst + ':'-guard så 'https://' og strenge-indhold
// IKKE fejl-strippes. (Blok/HTML-kommentarer er allerede fjernet før denne kører.)
function stripLineComment(line) {
  let inStr = null;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inStr) {
      if (c === '\\') { i++; continue; }
      if (c === inStr) inStr = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { inStr = c; continue; }
    if (c === '/' && line[i + 1] === '/' && line[i - 1] !== ':') return line.slice(0, i);
  }
  return line;
}

// Renderbart indhold pr. linje (kommentarer fjernet), parallelt med raw-linjer.
function renderableLines(text) {
  return stripBlockAndHtmlComments(text)
    .split('\n')
    .map(stripLineComment);
}

function describeGlyph(ch) {
  const cp = ch.codePointAt(0).toString(16).toUpperCase().padStart(4, '0');
  return `${ch} (U+${cp})`;
}

// ── Kerne: find emoji-som-ikon-overtrædelser i én fils tekst ─────────────────
// Returnerer [{ file, line, glyphs:[…], raw }]. `allowedOnLine` honorerer markøren
// målt mod RAW-linjen (markøren lever i en kommentar → ville ellers være strippet væk).
export function scanText(text, file = '<input>') {
  const rawLines = text.split('\n');
  const rendered = renderableLines(text);
  const violations = [];
  for (let i = 0; i < rendered.length; i++) {
    const matches = rendered[i].match(ICON_EMOJI_G);
    if (!matches) continue;
    if ((rawLines[i] || '').includes(ALLOW_MARKER)) continue; // bevidst-beholdt prosa
    violations.push({
      file,
      line: i + 1,
      glyphs: [...new Set(matches)].map(describeGlyph),
      raw: (rawLines[i] || '').trim(),
    });
  }
  return violations;
}

export function scanFile(relPath) {
  const text = readFileSync(join(REPO_ROOT, relPath), 'utf8');
  return scanText(text, relPath);
}

export function runGuard(files = GUARDED_FILES) {
  return files.flatMap(scanFile);
}

// ── Em-dash-scanner (parallelt med scanText; renderet tekst, kommentar-strippet) ──
export function scanEmDash(text, file = '<input>') {
  const rawLines = text.split('\n');
  const rendered = renderableLines(text);
  const violations = [];
  let inInstrument = false;
  for (let i = 0; i < rendered.length; i++) {
    const raw = rawLines[i] || '';
    // Instrument-region toggle (sentinel-kommentarer): verbatim-instrumenter er undtaget em-dash-reglen.
    if (raw.includes(EMDASH_INSTRUMENT_START)) { inInstrument = true; continue; }
    if (raw.includes(EMDASH_INSTRUMENT_END))   { inInstrument = false; continue; }
    if (inInstrument) continue;
    const matches = rendered[i].match(EMDASH_G);
    if (!matches) continue;
    if (raw.includes(EMDASH_ALLOW_MARKER)) continue; // bevidst-beholdt em-dash
    violations.push({
      file,
      line: i + 1,
      glyphs: [describeGlyph('—')],
      raw: raw.trim(),
    });
  }
  return violations;
}

export function scanFileEmDash(relPath) {
  const text = readFileSync(join(REPO_ROOT, relPath), 'utf8');
  return scanEmDash(text, relPath);
}

export function runEmDashGuard(files = EMDASH_GUARDED_FILES) {
  return files.flatMap(scanFileEmDash);
}

// ── NUDANSK-guard (anglicistisk bindestreg i sammensætninger, Viktor-direktiv 27/6) ──
// EKSPLICIT mønster-liste — ingen heuristik, ingen falske positive: dansk skriver
// sammensatte ord i ÉT ord ("oplæsningsvenlig", ikke "oplæsnings-venlig"). Når en
// 3-linse fanger et konkret tilfælde i klient-copy, rettes fladen OG mønstret seedes
// her, så det aldrig regredierer (født af F3, soevn-screening-3-linsen 2/7). Samme
// comment-strip som emoji/em-dash (kommentarer renderer ikke → uden for reglen).
export const NUDANSK_FORBUDT = [
  { re: /[Oo]plæsnings-venlig/, fix: 'oplæsningsvenlig (ét ord)' },
];

export function scanNudansk(text, file = '<input>') {
  const rawLines = text.split('\n');
  const rendered = renderableLines(text);
  const violations = [];
  for (let i = 0; i < rendered.length; i++) {
    for (const m of NUDANSK_FORBUDT) {
      const hit = rendered[i].match(m.re);
      if (!hit) continue;
      violations.push({ file, line: i + 1, glyphs: [`"${hit[0]}" → ${m.fix}`], raw: (rawLines[i] || '').trim() });
    }
  }
  return violations;
}

export function runNudanskGuard(files = GUARDED_FILES) {
  return files.flatMap((relPath) => scanNudansk(readFileSync(join(REPO_ROOT, relPath), 'utf8'), relPath));
}

// ── Standalone CI-hook ───────────────────────────────────────────────────────
function isMain() {
  return process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
}

if (isMain()) {
  const emojiViolations = runGuard();
  const emdashViolations = runEmDashGuard();
  const nudanskViolations = runNudanskGuard();
  let ok = true;

  if (nudanskViolations.length === 0) {
    console.log(`nudansk-guard ✓ - 0 forbudte sammensætnings-mønstre i ${GUARDED_FILES.join(', ')}`);
  } else {
    ok = false;
    console.error(`nudansk-guard ✗ - ${nudanskViolations.length} anglicistisk-bindestreg-regression(er):`);
    for (const v of nudanskViolations) {
      console.error(`  ${v.file}:${v.line}  ${v.glyphs.join(' ')}\n      ${v.raw}`);
    }
    console.error('FIX: skriv sammensætningen i ét ord (nudansk-direktiv 27/6, tjek ordnet.dk i tvivl).');
  }

  if (emojiViolations.length === 0) {
    console.log(`emoji-guard ✓ - 0 emoji-som-ikon i ${GUARDED_FILES.join(', ')}`);
  } else {
    ok = false;
    console.error(`emoji-guard ✗ - ${emojiViolations.length} emoji-som-ikon-regression(er):`);
    for (const v of emojiViolations) {
      console.error(`  ${v.file}:${v.line}  ${v.glyphs.join(' ')}\n      ${v.raw}`);
    }
    console.error(`FIX: erstat med eget house-style-SVG-ikon (aria-hidden="true"), ELLER`);
    console.error(`hvis det er bevidst prosa/alert/Psykoedukation: tilføj "${ALLOW_MARKER}: <begrundelse>" på linjen.`);
  }

  if (emdashViolations.length === 0) {
    console.log(`emdash-guard ✓ - 0 em-dash "—" i ${EMDASH_GUARDED_FILES.join(', ')}`);
  } else {
    ok = false;
    console.error(`emdash-guard ✗ - ${emdashViolations.length} em-dash-regression(er):`);
    for (const v of emdashViolations) {
      console.error(`  ${v.file}:${v.line}  ${v.glyphs.join(' ')}\n      ${v.raw}`);
    }
    console.error(`FIX: erstat em-dash med komma/punktum/kolon/parentes/bindestreg (betydning bevaret), ELLER`);
    console.error(`hvis bevidst beholdt: tilføj "${EMDASH_ALLOW_MARKER}: <begrundelse>" på linjen.`);
  }

  process.exit(ok ? 0 : 1);
}
