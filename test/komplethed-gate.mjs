// Komplethed-gate guard (GAD-7-fundet, 18-19/7) — RATCHET for AUDIT-lukningen 19/7 11:15.
//
// FUNDET: en halvt udfyldt GAD-7 kan læses som en gyldig LAV score. `computeScores`
// summerer blot de svar der findes (`sumSkema`, mentem-skema-core.js:430) og udleverer
// {total, max} UDEN noget komplethedssignal. 4 besvarede items á 2 giver total=8 —
// ikke til at skelne fra en ægte fuldt besvaret score på 8. Klinisk tavs fejllæsning.
//
// DET ENESTE VÆRN I DAG er UI-gaten i index.html:871 (`fb.disabled = answered < total`).
// AUDIT målte at den gate er NY: den kom i 5adb585 (31/5); i 8cb2dfe (20/3) fandtes den
// ikke, og ingen opdagede det i de ti uger. Præcis derfor må lukningen ikke være en
// observation: falder knappen ved et refactor, er der INTET bagved, og fejlen er tavs.
//
// HVAD DENNE TEST GØR — og hvorfor den ikke er et regex-tjek:
// den EKSTRAHERER `updateProgress` ordret fra index.html og EKSEKVERER den mod en
// stub-DOM med de ægte SKEMAER-definitioner fra core. Den måler altså gatens ADFÆRD
// på den kilde der faktisk shippes, ikke dens tilstedeværelse som tekst. Et refactor
// der beholder linjen men ændrer optællingen bliver også fanget.
//
// §4 er RED-beviset: samme harness køres mod en MUTERET kilde hvor gaten er slået fra.
// Består testen dér, er den værdiløs, og den siger det selv. En ratchet der ikke kan
// fejle, er en note om en ratchet.
//
// Registreret i noter/sikkerheds-fitness-functions-register-2026-07-12.md (ratchet-reglen:
// register opdateres i SAMME arbejde).
//
// Køres: node test/komplethed-gate.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { SKEMAER } from '../mentem-skema-core.js';

let fejl = 0;
function ok(cond, navn) { console.log((cond ? '  ✓ ' : '  ✗ FAIL ') + navn); if (!cond) fejl++; }

const here = dirname(fileURLToPath(import.meta.url));
const HTML = readFileSync(join(here, '..', 'index.html'), 'utf8');

// ── Ekstraktion: hent updateProgress ordret ud af index.html ────────────────
// Anker på funktions-hovedet og luk på første kolonne-nul '}' — funktionen er
// top-level i det inline script, så det er entydigt.
function udtrækUpdateProgress(html) {
  const start = html.indexOf('\nfunction updateProgress() {');
  if (start < 0) return null;
  const slut = html.indexOf('\n}\n', start);
  if (slut < 0) return null;
  return html.slice(start + 1, slut + 3);
}

// ── Harness: kør den ægte gate mod en stub-DOM ──────────────────────────────
// Returnerer knappens tilstand efter ét updateProgress-kald.
//
// ⚠️ `new Function` er brugt MED VILJE og er her ikke en injektions-vej: input er
// repoets egen `index.html`, læst fra disk i samme arbejdstræ som testen. Netop
// dét er pointen — vi måler den kilde der faktisk shippes, frem for en kopi der
// kan drive fra den. Intet eksternt/utrusted input når nogensinde hertil. En
// sikkerhedsscanner vil flagge linjen; dette er svaret på den.
function kørGate(kilde, { selected, answers }) {
  const fb = { disabled: null, textContent: null };
  const noder = {
    'finish-btn': fb,
    'progress-fill': { style: {} },
    'progress-current': {},
    'progress-total': {},
  };
  const document = { getElementById: (id) => noder[id] };
  // Funktionen lukker over selected/answers/SKEMAER/document i sit eget scope.
  const fabrik = new Function('document', 'selected', 'answers', 'SKEMAER',
    kilde + '\nreturn updateProgress;');
  fabrik(document, selected, answers, SKEMAER)();
  return fb;
}

// Byg et svar-objekt med `n` besvarede items for et skema (værdi 2 = midt på skalaen,
// så en delvis besvarelse giver en NON-nul total — det er hele fældens pointe).
function svar(id, n, værdi = 2) {
  const a = {};
  for (let i = 0; i < n; i++) a[i] = værdi;
  return { [id]: a };
}

console.log('Komplethed-gate guard (GAD-7-fundet — halvt udfyldt må ALDRIG kunne indsendes):');

// ── 1. Fundet er ægte: scoringen selv bærer intet komplethedssignal ─────────
// Dette er ikke en regression vi bevogter, det er PRÆMISSEN for at gaten skal findes.
// Fejler den her, er fundet lukket i datalaget og gaten er ikke længere eneste værn.
{
  const { computeScores } = await import('../mentem-skema-core.js');
  const halv = computeScores(svar('gad7', 4));      // 4 af 7 besvaret, á 2 → 8
  const hel  = computeScores(svar('gad7', 7, 0));   // 7 af 7 besvaret, á 0 → 0
  ok(halv.gad7 && halv.gad7.total === 8, 'PRÆMIS: 4 af 7 GAD-7-items á 2 scorer 8 (ikke null, ikke fejl)');
  ok(halv.gad7 && !('besvarede' in halv.gad7),
    'PRÆMIS: scoringen bærer INTET komplethedsfelt → UI-gaten er eneste værn (derfor §2-§4)');
  ok(hel.gad7 && hel.gad7.total === 0, 'PRÆMIS: en ægte fuldt besvaret lav score er 0 og skal kunne indsendes');
}

// ── 2. Gatens adfærd, målt på den kilde der shippes ─────────────────────────
const kilde = udtrækUpdateProgress(HTML);
ok(typeof kilde === 'string' && kilde.includes('finish-btn'),
  'updateProgress kunne ekstraheres ordret fra index.html');

if (kilde) {
  const gad7Antal = SKEMAER.gad7.items.length;

  const tom = kørGate(kilde, { selected: ['gad7'], answers: {} });
  ok(tom.disabled === true, `0 af ${gad7Antal} besvaret → Færdig-knappen er SPÆRRET`);

  const delvis = kørGate(kilde, { selected: ['gad7'], answers: svar('gad7', gad7Antal - 1) });
  ok(delvis.disabled === true, `${gad7Antal - 1} af ${gad7Antal} besvaret → SPÆRRET (kernen i fundet)`);
  ok(delvis.textContent === 'Mangler 1 svar', 'og knappen siger hvad der mangler, ikke bare "Færdig"');

  // Én besvaret er den farligste: den ligner en meget lav score.
  const næstenTom = kørGate(kilde, { selected: ['gad7'], answers: svar('gad7', 1) });
  ok(næstenTom.disabled === true, `1 af ${gad7Antal} besvaret → SPÆRRET (må ikke læses som lav score)`);

  const hel = kørGate(kilde, { selected: ['gad7'], answers: svar('gad7', gad7Antal) });
  ok(hel.disabled === false, `${gad7Antal} af ${gad7Antal} besvaret → knappen ÅBNER (gaten spærrer ikke gyldige svar)`);

  // Ægte nul-score skal kunne indsendes — ellers har vi byttet en tavs fejl ud med en
  // synlig blokade af klinisk gyldige besvarelser.
  const ægteNul = kørGate(kilde, { selected: ['gad7'], answers: svar('gad7', gad7Antal, 0) });
  ok(ægteNul.disabled === false, 'fuldt besvaret med lutter 0 ("Slet ikke") er GYLDIG og kan indsendes');

  // ── 3. Gaten skal holde over HELE batteriet, ikke kun det første skema ────
  // Et fuldt GAD-7 + et urørt PHQ-9 er præcis den delmængde et refactor kunne tabe.
  const flere = kørGate(kilde, {
    selected: ['gad7', 'phq9'],
    answers: svar('gad7', gad7Antal),
  });
  ok(flere.disabled === true, 'fuldt GAD-7 men urørt PHQ-9 → stadig SPÆRRET (gaten dækker hele batteriet)');

  const alle = kørGate(kilde, {
    selected: ['gad7', 'phq9'],
    answers: { ...svar('gad7', gad7Antal), ...svar('phq9', SKEMAER.phq9.items.length) },
  });
  ok(alle.disabled === false, 'begge skemaer fuldt besvaret → knappen ÅBNER');
}

// ── 4. RED-bevis: testen SKAL fejle når gaten slås fra ──────────────────────
// Uden dette led er §2 kun en påstand om at den måler noget. Vi muterer kilden
// (gaten sat til altid-åben) og kræver at den delvise besvarelse så slipper igennem.
// Gør den ikke det, måler harnessen ikke gaten, og §2's grønne flueben er falske.
if (kilde) {
  const muteret = kilde.replace('fb.disabled = answered < total;', 'fb.disabled = false;');
  ok(muteret !== kilde, 'RED-bevis: gate-linjen kunne muteres (ellers er ankeret drevet)');
  let mutantSlapIgennem = false;
  try {
    const r = kørGate(muteret, {
      selected: ['gad7'],
      answers: svar('gad7', SKEMAER.gad7.items.length - 1),
    });
    mutantSlapIgennem = (r.disabled === false);
  } catch { /* mutant kunne ikke køre → behandles som ikke-bevist */ }
  ok(mutantSlapIgennem,
    'RED-bevis: med gaten slået fra SLIPPER en delvis besvarelse igennem → testen kan faktisk fejle');
}

console.log(fejl === 0
  ? '\n✅ Komplethed-gate: alle grønne (og RED-beviset holder — testen kan fejle).'
  : `\n❌ ${fejl} fejl.`);
process.exit(fejl === 0 ? 0 : 1);
