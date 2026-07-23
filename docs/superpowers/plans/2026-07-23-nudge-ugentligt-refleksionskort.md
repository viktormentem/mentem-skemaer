# Ugentligt refleksions-kort — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tilføj ét ugentligt refleksions-kort til søvndagbogen der spejler ugens mønster — ægte fejring ved stærk uge, ellers støttende fokus på den dominerende udfordring, ellers blid opmuntring.

**Architecture:** Ny ren funktion `vaelgUgeKort(ugeEntries)` i `mentem-skema-core.js` tæller de allerede-gemte `nudgeKort.id` over ugens 7 entries (ingen genberegning, SRT-firewall intakt). `index.html` beregner ugekortet ved blok-grænsen (hver 7. NYE entry) i `saveDiaryEntry` og viser det i stedet for nat-kortet i `renderDiaryWelcome` (max ét kort).

**Tech Stack:** Vanilla ES-modul JS (ingen build), node til test-suiter (mønster: `test/nudge-*.mjs`).

**Spec:** `docs/superpowers/specs/2026-07-23-nudge-ugentligt-refleksionskort-design.md`

## Global Constraints

- Al klient-vendt tekst er **em-dash (—) og en-dash (–) fri** (samme kontrakt som nat-kort).
- **Verbatim-lås:** kort-teksterne er godkendt ORDRET af Viktor 23/7; kopiér dem tegn-for-tegn fra spec §5, ingen omformulering.
- **SRT-firewall:** `daytimeSleepiness_0_10` må ALDRIG indgå — funktionen læser kun `nudgeKort.id`.
- **Max ét kort:** ugekort ELLER nat-kort på welcome-skærmen, aldrig begge.
- **Additiv:** rør IKKE `vaelgNudgeKort`, payload-format eller gemte felter. Ugekortet persisteres ikke (kun visning).
- **nudge=0-vagt:** `nudgeFra` (Viktor-styret fra-slag) slår også ugekortet fra.
- Test-suiter køres med `node test/<fil>.mjs` fra repo-roden; exit 0 = grøn.

---

### Task 1: `vaelgUgeKort` — ren valg-funktion + tekster + node-test-suite

**Files:**
- Modify: `mentem-skema-core.js` (tilføj efter `vaelgNudgeKort`, ca. linje 447)
- Create: `test/nudge-uge-kort.mjs`

**Interfaces:**
- Consumes: `NUDGE_KORT_VERSION` (allerede eksporteret, `mentem-skema-core.js:386`).
- Produces:
  - `export function vaelgUgeKort(ugeEntries: Array<{nudgeKort?:{id:string}}>): {id:'UGE', variant:'fejring'|'fokus'|'opmuntring', titel:string, tekst:string, tekstVersion:string} | null`
  - `export const UGE_KORT_TEKST` (titel+tekst pr. variant)
  - `export const UGE_UDFORDRING_FRASE` (A/B/D/F → dansk frase)

- [ ] **Step 1: Write the failing test**

Create `test/nudge-uge-kort.mjs`:

```js
// nudge-uge-kort.mjs - ugentligt refleksions-kort: tally, tærskler, prioritet, tekster.
// Koer: node test/nudge-uge-kort.mjs
import { vaelgUgeKort, UGE_KORT_TEKST, UGE_UDFORDRING_FRASE } from '../mentem-skema-core.js';

let fejl = 0;
function check(navn, ok, detalje) {
  if (ok) console.log(`  ✓ ${navn}`);
  else { fejl++; console.error(`  ✗ ${navn}${detalje ? ` :: ${detalje}` : ''}`); }
}
// entry med givet kort-id (null = nat uden kort). Ekstra felter for firewall-test.
const n = (id, extra = {}) => ({ nudgeKort: id ? { id, tekstVersion: 'v1' } : null, ...extra });

console.log('Fejring (holdt-vindue {C,E} >= 5):');
check('5xC -> fejring', vaelgUgeKort([n('C'),n('C'),n('C'),n('C'),n('C'),n('A'),n('B')])?.variant === 'fejring');
check('C+E-mix >=5 -> fejring', vaelgUgeKort([n('C'),n('C'),n('C'),n('E'),n('E'),n('A'),n('A')])?.variant === 'fejring');
check('4 holdt + 3 A -> IKKE fejring (4<5)', vaelgUgeKort([n('C'),n('C'),n('C'),n('C'),n('A'),n('A'),n('A')])?.variant !== 'fejring');

console.log('Stoettende fokus (dominerende udfordring >= 3):');
const fA = vaelgUgeKort([n('C'),n('C'),n('C'),n('C'),n('A'),n('A'),n('A')]);
check('4 holdt + 3 A -> fokus', fA?.variant === 'fokus');
check('fokus A tekst baerer frasen + antal 3', fA?.tekst.includes(UGE_UDFORDRING_FRASE.A) && fA?.tekst.includes('3 nætter'));
const fD = vaelgUgeKort([n('D'),n('D'),n('D'),n('D'),n('C'),n('C'),n(null)]);
check('4 D -> fokus D, antal 4', fD?.variant === 'fokus' && fD?.tekst.includes(UGE_UDFORDRING_FRASE.D) && fD?.tekst.includes('4 nætter'));

console.log('Uafgjort -> prioritet A>B>D>F:');
check('3 A + 3 B -> fokus A', vaelgUgeKort([n('A'),n('A'),n('A'),n('B'),n('B'),n('B'),n(null)])?.tekst.includes(UGE_UDFORDRING_FRASE.A));
check('3 B + 3 D -> fokus B', vaelgUgeKort([n('B'),n('B'),n('B'),n('D'),n('D'),n('D'),n(null)])?.tekst.includes(UGE_UDFORDRING_FRASE.B));
check('3 A + 4 D -> fokus D (hyppigst vinder over prioritet)', vaelgUgeKort([n('A'),n('A'),n('A'),n('D'),n('D'),n('D'),n('D')])?.tekst.includes(UGE_UDFORDRING_FRASE.D));

console.log('Blid opmuntring (intet >=3, holdt <5):');
check('2 A + 2 C + 1 D + 2 null -> opmuntring', vaelgUgeKort([n('A'),n('A'),n('C'),n('C'),n('D'),n(null),n(null)])?.variant === 'opmuntring');

console.log('Defensivt gulv / robusthed:');
check('3 entries -> null', vaelgUgeKort([n('C'),n('C'),n('C')]) === null);
check('ikke-array -> null', vaelgUgeKort(null) === null);
check('entries uden nudgeKort tælles ikke (giver opmuntring, ikke crash)',
  vaelgUgeKort([n(null),n(null),n(null),n(null)])?.variant === 'opmuntring');
check('daytimeSleepiness i entry ændrer intet (firewall)',
  vaelgUgeKort([n('C',{daytimeSleepiness_0_10:9}),n('C'),n('C'),n('C'),n('C'),n('A'),n('A')])?.variant === 'fejring');

console.log('Tekster:');
for (const v of ['fejring','fokus','opmuntring'])
  check(`variant ${v} dash-fri (em + en) + tekstVersion`, (() => {
    const arr = v === 'fejring' ? [n('C'),n('C'),n('C'),n('C'),n('C'),n(null),n(null)]
      : v === 'fokus' ? [n('A'),n('A'),n('A'),n('C'),n(null),n(null),n(null)]
      : [n('A'),n('A'),n('C'),n('C'),n('D'),n(null),n(null)];
    const k = vaelgUgeKort(arr);
    return k?.variant === v && k.tekstVersion === 'v1'
      && !k.tekst.includes('—') && !k.tekst.includes('–')
      && !k.titel.includes('—') && !k.titel.includes('–');
  })());

process.exit(fejl ? 1 : 0);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/viktornielsen/Documents/MEMTEM/mentem-skemaer && node test/nudge-uge-kort.mjs`
Expected: FAIL — `SyntaxError` / `vaelgUgeKort is not a function` (funktionen findes ikke endnu).

- [ ] **Step 3: Write minimal implementation**

I `mentem-skema-core.js`, indsæt EFTER `vaelgNudgeKort`-funktionen (efter dens afsluttende `}` ca. linje 447, FØR `// Mikro-probe`-blokken):

```js
// ── Ugentligt refleksions-kort (mønster over ugens 7 nætter) ────────────────
// Laeser KUN gemte nudgeKort.id (SRT-firewall: daytimeSleepiness roeres ALDRIG).
// Verbatim godkendt af Viktor 23/7 (spec §5). Em-/en-dash-fri.
export const UGE_KORT_TEKST = {
  fejring: {
    titel: 'Stærk uge',
    tekst: 'Du holdt dit søvnvindue de fleste nætter i denne uge. Det er præcis sådan søvnen får lov at falde til ro. Bliv ved.',
  },
  fokus: {
    titel: 'Et blik på ugen',
    // {udfordring} + {n} indsaettes af vaelgUgeKort.
    tekst: 'Du har fulgt din dagbog i denne uge, og det tæller. Det der fyldte mest var {udfordring}, {n} nætter. Det er et helt almindeligt sted at starte, og det tager vi sammen.',
  },
  opmuntring: {
    titel: 'Du er i gang',
    tekst: 'Du er godt i gang med at bygge vanen. Bliv ved, så tegner mønsteret sig, og vi ser det sammen.',
  },
};
export const UGE_UDFORDRING_FRASE = {
  A: 'at komme for sent op af sengen',
  B: 'at gå tidligt i seng',
  D: 'at ligge vågen om natten',
  F: 'alkohol tæt på sengetid',
};

// ugeEntries = ugens (op til 7) entries. Returnerer ét ugekort eller null.
export function vaelgUgeKort(ugeEntries) {
  if (!Array.isArray(ugeEntries)) return null;
  const entries = ugeEntries.filter(e => e && typeof e === 'object');
  if (entries.length < 4) return null;                        // defensivt gulv (spec §4.0)
  const tally = {};
  for (const e of entries) {
    const id = e.nudgeKort && e.nudgeKort.id;
    if (id) tally[id] = (tally[id] || 0) + 1;
  }
  const holdt = (tally.C || 0) + (tally.E || 0);              // vindue-troskab (spec §3)
  const byg = (variant, tekst) => ({
    id: 'UGE', variant,
    titel: UGE_KORT_TEKST[variant].titel,
    tekst: tekst || UGE_KORT_TEKST[variant].tekst,
    tekstVersion: NUDGE_KORT_VERSION,
  });
  // 1. Fejring: holdt-vindue >= 5.
  if (holdt >= 5) return byg('fejring');
  // 2. Stoettende fokus: dominerende udfordring >= 3; uafgjort -> prioritet A>B>D>F.
  const PRIORITET = ['A', 'B', 'D', 'F'];
  let bedst = null;
  for (const id of PRIORITET) {
    const antal = tally[id] || 0;
    if (antal >= 3 && (bedst === null || antal > bedst.antal)) bedst = { id, antal };
  }
  if (bedst) {
    const tekst = UGE_KORT_TEKST.fokus.tekst
      .replace('{udfordring}', UGE_UDFORDRING_FRASE[bedst.id])
      .replace('{n}', String(bedst.antal));
    return byg('fokus', tekst);
  }
  // 3. Blid opmuntring.
  return byg('opmuntring');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/viktornielsen/Documents/MEMTEM/mentem-skemaer && node test/nudge-uge-kort.mjs`
Expected: PASS — alle linjer `✓`, exit 0.

- [ ] **Step 5: Run de øvrige nudge-suiter (ingen regression)**

Run: `cd /Users/viktornielsen/Documents/MEMTEM/mentem-skemaer && for t in nudge-kort-motor nudge-eval-kontrakt nudge-payload-kontrakt; do node test/$t.mjs >/dev/null 2>&1 && echo "$t PASS" || echo "$t FAIL"; done`
Expected: alle tre `PASS`.

- [ ] **Step 6: Commit**

```bash
cd /Users/viktornielsen/Documents/MEMTEM/mentem-skemaer
git add mentem-skema-core.js test/nudge-uge-kort.mjs
git commit -m "feat(nudge): vaelgUgeKort - ugentligt refleksions-kort (motor + tests) [verify-pause]"
```

---

### Task 2: Integrér ugekortet i søvndagbogen (index.html)

**Files:**
- Modify: `index.html` — import-blok (~466), `senesteNudgeKort`-decl (~1057), `renderDiaryWelcome` (~1270), `saveDiaryEntry` (~2669)

**Interfaces:**
- Consumes: `vaelgUgeKort` fra Task 1.
- Produces: session-variabel `senesteUgeKort`; ugekort vist i `#nudge-kort` med prioritet over nat-kortet.

- [ ] **Step 1: Importér `vaelgUgeKort`**

I `index.html` import-blokken (linje ~466, hvor `vaelgNudgeKort,` står), tilføj `vaelgUgeKort,`:

```js
         SRT_VINDUE_TEKST, SOEVN_F2, vaelgNudgeKort, vaelgUgeKort,
         NUDGE_EVAL_MILEPAELE, NUDGE_EVAL_SVAR, NUDGE_EVAL_TEKST } from './mentem-skema-core.js';
```

- [ ] **Step 2: Deklarér session-variablen**

Efter `let senesteNudgeKort = null; ...` (linje ~1057), tilføj:

```js
let senesteUgeKort = null;   // ugentligt refleksions-kort: session-scoped, IKKE persisteret; erstatter nat-kortet på blok-grænsen
```

- [ ] **Step 3: Beregn ugekortet ved blok-grænsen i `saveDiaryEntry`**

I `saveDiaryEntry`, find dedup/sort-blokken:

```js
  // Dag-dedup: én entry pr. kalenderdag (overskriv hvis samme dag gemmes igen).
  const idx = diaryState.entries.findIndex(e => e.date === date);
  if (idx >= 0) diaryState.entries[idx] = entry; else diaryState.entries.push(entry);
  diaryState.entries.sort((a, b) => a.date.localeCompare(b.date));
```

Tilføj UMIDDELBART EFTER `.sort(...)`-linjen:

```js
  // Ugentligt refleksions-kort: kun ved en NY entry der bringer antallet til et
  // multiplum af 7 (samme entry-rytme som proben). Erstatter nat-kortet den morgen
  // (max ét kort). nudge=0 slår det fra. Session-scoped, ikke persisteret.
  const erNyEntry = idx < 0;
  senesteUgeKort = (srtAktiv && !nudgeFra && erNyEntry && diaryState.entries.length % 7 === 0)
    ? vaelgUgeKort(diaryState.entries.slice(-7))
    : null;
```

- [ ] **Step 4: Vis ugekortet med prioritet i `renderDiaryWelcome`**

Find i `renderDiaryWelcome` (linje ~1272) nat-kort-renderet:

```js
  const nk = document.getElementById('nudge-kort');
  if (nk) {
    if (senesteNudgeKort) {
      nk.style.display = 'block';
      nk.className = 'nudge-kort nudge-' + senesteNudgeKort.id;
      nk.innerHTML = '<h3 class="nudge-titel srt-aloud">' + srtEsc(senesteNudgeKort.titel)
        + '</h3><div class="srt-aloud">' + srtEsc(senesteNudgeKort.tekst) + '</div>';
    } else { nk.style.display = 'none'; nk.innerHTML = ''; }
  }
```

Erstat med (ugekort vinder over nat-kort):

```js
  const nk = document.getElementById('nudge-kort');
  if (nk) {
    const visKort = senesteUgeKort || senesteNudgeKort;   // ugekort erstatter nat-kort (max ét)
    if (visKort) {
      nk.style.display = 'block';
      nk.className = 'nudge-kort nudge-' + visKort.id;
      nk.innerHTML = '<h3 class="nudge-titel srt-aloud">' + srtEsc(visKort.titel)
        + '</h3><div class="srt-aloud">' + srtEsc(visKort.tekst) + '</div>';
    } else { nk.style.display = 'none'; nk.innerHTML = ''; }
  }
```

- [ ] **Step 5: Se-det-virke (browser) — seed 6 nætter, udfyld den 7.**

Server appen lokalt og lav en font-fri + cache-bust kopi (samme flow som denne session):

```bash
cd /Users/viktornielsen/Documents/MEMTEM/mentem-skemaer
grep -v "fonts.googleapis.com/css2" index.html | sed "s#\./mentem-skema-core\.js'#./mentem-skema-core.js?v=uge'#g" > index-test.html
python3 -m http.server 8777 >/tmp/sk-server.log 2>&1 &
```

I browseren (Chrome-extension), naviger til `http://localhost:8777/index-test.html?s=soevndagbog&tib=390&wake=06:00&tn=1`, og seed 6 tidligere nætter direkte i localStorage via `javascript_tool` (localStorage er tilladt; kun query-string/base64 er blokeret):

```js
// 6 nætter: 4x holdt (C) + 2x "op for sent" (A). Datoer FØR i dag.
const st = JSON.parse(localStorage.getItem('mentem_csd_v1') || '{}');
st.plannedDays = st.plannedDays || 14;
const ids = ['C','C','C','C','A','A'];
st.entries = ids.map((id,i) => ({
  date: '2026-07-' + String(10+i).padStart(2,'0'),
  bedtime:'23:30', outOfBed:'06:10', sleepLatencyMin:10, awakeningsCount:1,
  awakeningsMin:5, finalAwake:'06:00', quality:3, nudgeKort:{id, tekstVersion:'v1'}
}));
st.nudgeKortSet = true;
localStorage.setItem('mentem_csd_v1', JSON.stringify(st));
'seeded ' + st.entries.length;
```

Genindlæs siden. Udfyld den **7.** nat via formularen (fx holdt vindue: outOfBed 06:10, quality 3) og tryk Gem.
Expected: welcome-skærmen viser **ugekortet** (fejring "Stærk uge" hvis den 7. også er holdt → 5x holdt; ellers fokus/opmuntring efter tallene), IKKE et nat-kort. Titlen er accent-grøn `<h3>`. Tag screenshot til `.test-evidence/nudge-kort/uge-kort-fejring.jpg`. **Fabrikér ALDRIG.**

Verificér desuden non-boundary: tryk "Ret dagens svar" + Gem igen (en redigering, ikke ny entry) → ugekortet forsvinder, nat-kortet vises (bekræfter `erNyEntry`-vagten).

Ryd op: `rm index-test.html`; dræb serveren.

- [ ] **Step 6: Commit**

```bash
cd /Users/viktornielsen/Documents/MEMTEM/mentem-skemaer
git add index.html .test-evidence/nudge-kort/
git commit -m "feat(nudge): ugekort integreret i soevndagbog - erstatter nat-kort paa blok-graense [verify-pause]"
```

---

## Non-goals (YAGNI)

- Ingen payload-eksport af ugekortet (kun visning) · ingen rullende vindue · ingen distinkt CSS for `nudge-UGE` (genbrug base) · ingen app-side ændring · ingen ændring af nat-motoren.
