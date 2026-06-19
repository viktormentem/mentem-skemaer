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

// ── Standalone CI-hook ───────────────────────────────────────────────────────
function isMain() {
  return process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
}

if (isMain()) {
  const violations = runGuard();
  if (violations.length === 0) {
    console.log(`emoji-guard ✓ — 0 emoji-som-ikon i ${GUARDED_FILES.join(', ')}`);
    process.exit(0);
  }
  console.error(`emoji-guard ✗ — ${violations.length} emoji-som-ikon-regression(er):`);
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}  ${v.glyphs.join(' ')}\n      ${v.raw}`);
  }
  console.error(`\nFIX: erstat med eget house-style-SVG-ikon (aria-hidden="true"), ELLER —`);
  console.error(`hvis det er bevidst prosa/alert/Psykoedukation — tilføj "${ALLOW_MARKER}: <begrundelse>" på linjen.`);
  process.exit(1);
}
