# Spec: Ugentligt refleksions-kort (mønster-bevidste nudge-kort)

**Dato:** 2026-07-23 · **Repo:** mentem-skemaer (web) · **Gren:** feat/nudge-kort-2026-07-23
**Status:** design godkendt af Viktor (brainstorm 23/7). Verbatim-tekst godkendt. Afventer spec-review.

## 1. Formål og kontekst

Feature B gav klienten et lille nudge-kort HVER morgen ud fra **den nats** dagbog (kort A-F).
Dette scope tilføjer ét **ugentligt refleksions-kort**: én gang om ugen zoomer kortet ud og
spejler **mønsteret** over ugen — enten ugens dominerende udfordring ELLER en ægte fejring af en
stærk uge. Formålet er klinisk meningsfuld feedback på en *tendens* frem for en enkelt nat, leveret
i samme varme, ikke-dømmende, alliance-orienterede sprog som resten (MCT-konsistent).

Kadencen (ugentlig) matcher SRT's egen rytme: titrering besluttes ugentligt. Kortet lander som en
terapeuts ugentlige gennemgang, ikke som daglig pålydende.

## 2. Arkitektur

- **Separat korttype.** Ikke en daglig linje, ikke en betinget erstatning midt i ugen.
- **Kadence:** fyrer på blok-grænsen — dvs. når `diaryState.entries.length` netop er blevet et
  positivt multiplum af **7** (7, 14, 21 …) efter gem. Blokken = de 7 entries i den netop-afsluttede
  gruppe (`entries[length-7 .. length-1]`). Samme entry-tælle-rytme som mikro-proben (der fyrer efter
  7./21. gemte udfyldning), IKKE kalender-baseret — så en klient der springer en dag over stadig får
  ugekortet efter 7 faktiske nætters data.
- **Erstatter nat-kortet den ene morgen.** Invarianten "højst ét kort på welcome-skærmen" bevares:
  når ugekortet vises, beregnes/vises nat-kortet IKKE den morgen.
- **Placering:** samme plads som nat-kortet (`#nudge-kort` på welcome-skærmen, `renderDiaryWelcome`).
- **Session-scoped visning** som nat-kortet (senesteUgeKort), ikke persisteret som selvstændig state.

## 3. Datagrundlag (SRT-firewall-sikkert)

Hver dagbogs-entry bærer allerede `nudgeKort: {id, tekstVersion}` — det kort-id (A-F) der fyrede
den nat, beregnet med **den nats korrekte vindue**. Ugekortet aflæser udelukkende disse gemte id'er
over ugens 7 entries. **Ingen genberegning. `daytimeSleepiness_0_10` indgår ALDRIG** (score-lås,
spec-ux §2.4) — vi rører kun kort-id'erne.

**Grupper:**
- **Holdt-vindue-nætter** = id ∈ **{C, E}**. Begge er ikke-glidnings-nætter hvor vindue-adfærden i
  praksis blev mødt (C = holdt + fin søvn; E = holdt + dårlig søvn i uge 1). Vi fejrer **adfærden
  (vindue-troskab)**, ikke søvnkvaliteten — præcis SRT-budskabet: troskab først, søvnen følger.
- **Udfordringer** = id ∈ {A (op for sent), B (i seng for tidligt), D (længe vågen), F (alkohol)}.
- Nætter uden kort (`nudgeKort` = null/mangler) tælles hverken som holdt eller udfordring.

## 4. Valg-logik (ren funktion, unit-testbar)

Ny ren funktion i `mentem-skema-core.js`, fx `vaelgUgeKort(ugeEntries)` → `{ id:'UGE', variant, titel, tekst, tekstVersion } | null`.
`ugeEntries` = de (op til 7) entries i den netop-afsluttede uge-blok.

**Rækkefølge:**

0. **Defensivt gulv:** færre end **4** entries i blokken (bør ikke ske i normal flow, hvor blokken
   altid er 7 — men defensivt mod dataregenerering/partiel import) → returnér `null` (intet ugekort;
   nat-kortet vises som normalt).
1. **Fejring** — holdt-vindue-nætter **≥ 5** → variant `fejring`.
2. **Støttende fokus** — ellers: find den hyppigste udfordrings-bucket (A/B/D/F). Hvis dens antal
   **≥ 3** → variant `fokus`, med den bucket + dens antal `n`.
   - Uafgjort mellem to buckets med samme (≥3) antal: fast prioritet **A > B > D > F**
     (samme akse som nat-motorens prioritet; op-for-sent er det vigtigste SRT-greb).
3. **Blid opmuntring** — ellers (≥4 udfyldt, men hverken ≥5 holdt eller en ≥3-udfordring) →
   variant `opmuntring`.

Note: med 7 nætter kan `fejring` (≥5 holdt) og en `fokus`-udfordring (≥3) ikke sameksistere —
5 + 3 > 7. Derfor er varianterne gensidigt udelukkende og logikken entydig.

## 5. Verbatim-tekst (LÅST — godkendt af Viktor 23/7)

Em-/en-dash-fri (samme kontrakt som nat-kort). Én dynamisk slot findes kun i `fokus`-varianten.

**variant `fejring`** (holdt ≥5) — fuldt statisk:
> **Titel:** Stærk uge
> **Tekst:** Du holdt dit søvnvindue de fleste nætter i denne uge. Det er præcis sådan søvnen får lov at falde til ro. Bliv ved.

**variant `fokus`** (dominerende udfordring ≥3) — én dynamisk slot `{udfordring}` + antal `{n}`:
> **Titel:** Et blik på ugen
> **Tekst:** Du har fulgt din dagbog i denne uge, og det tæller. Det der fyldte mest var {udfordring}, {n} nætter. Det er et helt almindeligt sted at starte, og det tager vi sammen.

`{udfordring}`-fraser (låst, indsættes ordret):
- A → `at komme for sent op af sengen`
- B → `at gå tidligt i seng`
- D → `at ligge vågen om natten`
- F → `alkohol tæt på sengetid`

`{n}` er et heltal (antal nætter bucket'en fyrede). Fraserne er formet så "{udfordring}, {n} nætter"
læser naturligt uanset bucket.

**variant `opmuntring`** (blandet) — fuldt statisk:
> **Titel:** Du er i gang
> **Tekst:** Du er godt i gang med at bygge vanen. Bliv ved, så tegner mønsteret sig, og vi ser det sammen.

Åbningen "Du har fulgt din dagbog ... og det tæller" i `fokus` anerkender **indsatsen** (altid sand,
altid ægte) i stedet for at rose et søvn-tal der ikke blev nået — så fejrings-sprog kun optræder når
det er fortjent (≥5 holdt), mens en hård uge stadig mødes varmt uden falsk ros eller skam.

## 6. Rendering + interaktion

- `renderDiaryWelcome`: hvis et ugekort er valgt for denne morgen, render det i `#nudge-kort`
  (samme markup/klasser som nat-kortet, inkl. `.srt-aloud` så det læses op, og `<h3>`-titel), og
  spring nat-kort-beregningen over.
- **Mikro-probe-kollision:** proben ("Har kortene været en hjælp?") fyrer efter 7. og 21. udfyldning
  — samme morgener som ugekortet. Proben er lille og sidder UNDER kortet (`#nudge-eval`). **Beslutning:
  lad dem sameksistere** (ugekort som "helt", probe som lille opfølgning nedenunder). Flaget til
  Viktors endelige vurdering; alternativ (udskyd probe én dag) er triviel hvis han foretrækker det.
- **nudge=0 (Viktor-styret fra-slag):** slår ALT fra, inkl. ugekortet (samme `nudgeFra`-vagt).

## 7. Vagter (ikke til forhandling)

- **SRT-firewall:** `daytimeSleepiness_0_10` indgår aldrig i ugekort-valget.
- **Verbatim-lås:** teksterne i §5 er godkendt ordret; ændres kun med ny Viktor-godkendelse.
- **Max ét kort:** ugekort ELLER nat-kort, aldrig begge.
- **Additiv:** ingen ændring af eksisterende nat-motor (`vaelgNudgeKort`), payload-format eller
  gemte felter ud over evt. en ren visnings-variabel. Ugekortet PERSISTERES ikke i payload i dette
  scope (kun visning) — kan tilføjes additivt senere hvis psykologen skal se det.

## 8. Test (TDD, node-suite som de øvrige nudge-suiter)

Ny fil `test/nudge-uge-kort.mjs` mod `vaelgUgeKort`:
- `fejring`: 5×C → fejring; 6×{C,E-mix} → fejring; 4 holdt + 3 A → IKKE fejring (4<5).
- `fokus`: 3×A (+ resten holdt/null under 5 holdt) → fokus A, n=3; 4×D → fokus D, n=4.
- **Uafgjort:** 3×A + 3×B → fokus **A** (prioritet).
- `opmuntring`: 4 udfyldt, 2×A + 2×C (intet ≥3, holdt<5) → opmuntring.
- **Tyndt grundlag:** 3 udfyldte entries → `null`.
- **Firewall/robusthed:** entries uden `nudgeKort` tælles ikke; daytimeSleepiness i entry ændrer
  intet.
- **Dash-fri + tekstVersion** på alle varianter (samme kontrakt som nat-kort).

## 9. Non-goals (YAGNI)

- Ingen rullende vindue (fast blok kun).
- Ingen flere fokus-punkter pr. kort (højst ét).
- Ingen ny payload-eksport af ugekortet (kun visning i dette scope).
- Ingen ændring af nat-kort-teksterne eller -motoren.
- Ingen app-side (Mentem/Companion) ændring — rent web.

## 10. Åbne punkter til spec-review

- Probe-kollision: sameksistens (valgt) vs. udskyd probe én dag?
- `fejring`-tekst: kvalitativ ("de fleste nætter", valgt) vs. med tal ("X nætter")?
- Skal holdt-vindue tælle {C, E} (valgt, se §3) eller kun C?
