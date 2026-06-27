// mentem-skema-core.js - MCT-skema-kadence kerne (P1a)
//
// Miljø-agnostisk ES-modul: kører identisk i browser (<script type="module">)
// OG i Node 18+ (round-trip-harness + selftest). Ren WebCrypto - INGEN
// tredjeparts-krypto-lib, INGEN privat/prod-nøgle (KRYPTO-GUARD: static-site
// har KUN modtagerens PUBLIC X25519-nøgle og KRYPTERER; kun Mentem dekrypterer).
//
// Krypto-kontrakt (SKAL matche Mentems E2EKryptering.swift PRÆCIST):
//   Curve25519 (X25519) ECDH → HKDF-SHA256(salt, info="TherapyCopilot-E2E-Export-v1", 32B)
//   → AES-256-GCM. Container = KrypteretEksportContainer (ciphertext + tag SEPARAT,
//   ISO8601-datoer UDEN fraktioner - CryptoKit .iso8601 afviser millisekunder).
//
// Spec: noter/spec-mct-skema-kadence-2026-05-31.md v1.3 (§3, §4, §9, §12, R3, R5).

// ════════════════════════════════════════════════════════════════════════
//  SKEMA-DEFINITIONER
// ════════════════════════════════════════════════════════════════════════
// Kanonisk rækkefølge (proces-spine først, så symptom/outcome/funktion, alliance sidst).
export const SKEMA_ORDER = ['cas', 'mcb', 'gad7', 'phq9', 'who5', 'wsas', 'waisr'];

// Frekvens-svarmuligheder (PHQ-9 / GAD-7, 0-3).
const FREQ_0_3 = [
  { label: 'Slet ikke', value: 0 },
  { label: 'Adskillige dage', value: 1 },
  { label: 'Mere end halvdelen af dagene', value: 2 },
  { label: 'Næsten hver dag', value: 3 },
];

// WHO-5 svarmuligheder (0-5).
const WHO5_OPTS = [
  { label: 'På intet tidspunkt', value: 0 },
  { label: 'Lidt af tiden', value: 1 },
  { label: 'Lidt under halvdelen af tiden', value: 2 },
  { label: 'Lidt over halvdelen af tiden', value: 3 },
  { label: 'Det meste af tiden', value: 4 },
  { label: 'Hele tiden', value: 5 },
];

// WSAS svarmuligheder (0-8, vis kun yderpunkter + midte som ledetekst).
const WSAS_OPTS = Array.from({ length: 9 }, (_, v) => ({ value: v, label: String(v) }));

// WAI-SR svarmuligheder (1-6).
const WAISR_OPTS = [
  { label: 'Sjældent', value: 1 },
  { label: 'Lejlighedsvist', value: 2 },
  { label: 'Af og til', value: 3 },
  { label: 'Tit', value: 4 },
  { label: 'Meget tit', value: 5 },
  { label: 'Altid', value: 6 },
];

export const SKEMAER = {
  // ── Egen-forfattet MCT-proces-spine (§12, fri klinisk metode) ──────────
  cas: {
    id: 'cas', kind: 'vas', title: 'Ugens mønstre', short: 'Ugens mønstre',
    icon: 'kompas', badge: '4 skalaer',
    instruction: 'Tænk på den seneste uge. Træk i hver skala for at vise, hvor stor del af tiden (0–100 %) du oplevede følgende. Der er ingen rigtige eller forkerte svar.',
    items: [
      { key: 'worry', text: 'Tid brugt på bekymring (om fremtiden, "hvad nu hvis…")' },
      { key: 'rumination', text: 'Tid brugt på grublen (at tænke igen og igen over problemer eller fortiden)' },
      { key: 'threat', text: 'Tid brugt på at holde øje med trusler eller fare (i kroppen, tankerne eller omgivelserne)' },
      { key: 'avoidance', text: 'Tid brugt på at undgå eller skubbe ubehagelige tanker væk' },
    ],
    vasMin: 'Slet ingen tid', vasMax: 'Næsten hele tiden',
  },
  mcb: {
    id: 'mcb', kind: 'vas', title: 'Tanker om bekymring', short: 'Tanker om bekymring',
    icon: 'tanker', badge: '5 skalaer',
    instruction: 'Hvor enig er du i hvert udsagn lige nu? Træk i skalaen fra helt uenig til helt enig.',
    items: [
      { key: 'positive', text: 'At bekymre mig hjælper mig med at være forberedt og håndtere ting' },
      { key: 'uncontrollability', text: 'Når jeg først begynder at bekymre mig, kan jeg ikke stoppe det' },
      { key: 'danger', text: 'Min bekymring er skadelig eller farlig for mig' },
      { key: 'needcontrol', text: 'Det er vigtigt at have kontrol over mine tanker' },
      { key: 'selfconsciousness', text: 'Jeg lægger meget mærke til mine egne tanker og holder øje med, hvad jeg tænker' },
    ],
    vasMin: 'Helt uenig', vasMax: 'Helt enig',
  },
  // ── Symptom (frit/public domain) ───────────────────────────────────────
  // emdash-guard:instrument-start (validerede instrumenter GAD-7/PHQ-9/WHO-5/WSAS): gengivet
  // VERBATIM fra kilden; em-dash-reglen gælder IKKE reproducerede instrumenter (CLAUDE.md-undtagelse,
  // Viktor 2026-06-19). Vores EGEN copy (CAS/MCB ovenfor, anmod, §2b) forbliver em-dash-fri + guardet.
  gad7: {
    id: 'gad7', kind: 'radio', title: 'GAD-7', short: 'Bekymring og uro', icon: 'sky', badge: '7 spørgsmål',
    instruction: 'Hvor tit har du været generet af følgende problemer i løbet af de seneste 2 uger?',
    options: FREQ_0_3, max: 21,
    items: [
      'Føler dig nervøs, angst eller på kanten',
      'Er ude af stand til at stoppe med at bekymre dig eller kontrollere din bekymring',
      'Bekymrer dig for meget om forskellige ting',
      'Har svært ved at slappe af',
      'Er så rastløs at det er svært at sidde stille',
      'Bliver nemt irritabel eller gnaven',
      'Føler dig bange, som om noget forfærdeligt kan ske',
    ],
  },
  phq9: {
    id: 'phq9', kind: 'radio', title: 'PHQ-9', short: 'Humør og energi', icon: 'sol', badge: '9 spørgsmål',
    instruction: 'Hvor tit har du været generet af følgende problemer i løbet af de seneste 2 uger?',
    options: FREQ_0_3, max: 27,
    items: [
      'Lille interesse eller glæde ved at gøre ting',
      'Følelse af at være nedtrykt, deprimeret eller håbløs',
      'Besvær med at falde i søvn, at sove igennem, eller omvendt at sove for meget',
      'Følelse af at være træt eller have meget lidt energi',
      'Dårlig appetit eller omvendt at spise for meget',
      'Dårlig mening om dig selv — eller en følelse af at du er en fiasko eller har svigtet dig selv eller din familie',
      'Besvær med at koncentrere dig om ting, f.eks. at læse avisen eller se fjernsyn',
      'At bevæge eller tale så langsomt at andre kunne have bemærket det — eller omvendt at være så rastløs at du bevæger dig mere end normalt',
      'Tanker om at du hellere ville være død, eller om at skade dig selv på en eller anden måde',
    ],
  },
  // ── Trivsel + funktion (frit m. attribution, R7.5) ─────────────────────
  who5: {
    id: 'who5', kind: 'radio', title: 'WHO-5', short: 'Generel trivsel', icon: 'plante', badge: '5 spørgsmål',
    instruction: 'Angiv for hvert af de fem udsagn, hvad der bedst beskriver, hvordan du har haft det i de seneste 2 uger.',
    options: WHO5_OPTS, max: 25,
    attribution: 'WHO-5 Trivselindeks © WHO (1998). Gengivet uændret med kildeangivelse (CC BY-NC-SA).',
    items: [
      'Jeg har følt mig glad og i godt humør',
      'Jeg har følt mig rolig og afslappet',
      'Jeg har følt mig aktiv og energisk',
      'Jeg er vågnet frisk og udhvilet',
      'Min dagligdag har været fyldt med ting, der interesserer mig',
    ],
  },
  wsas: {
    id: 'wsas', kind: 'radio', title: 'WSAS', short: 'Hverdag og funktion', icon: 'puslespil', badge: '5 spørgsmål',
    instruction: 'Hvor meget påvirker dine vanskeligheder din evne til følgende? 0 = slet ikke påvirket, 8 = meget svært påvirket.',
    options: WSAS_OPTS, max: 40,
    attribution: 'Work and Social Adjustment Scale (WSAS). Reproduced with kind permission of Professor Isaac Marks (Mundt et al. 2002).',
    items: [
      'Mit arbejde (eller studie/daglige hovedbeskæftigelse)',
      'Husholdning og praktiske opgaver i hjemmet',
      'Sociale fritidsaktiviteter (sammen med andre)',
      'Private fritidsaktiviteter (alene)',
      'Nære relationer — familie og parforhold',
    ],
  },
  // emdash-guard:instrument-end
  // ── Alliance (frit/public domain, alliance-checkpoints) ────────────────
  waisr: {
    id: 'waisr', kind: 'radio', title: 'WAI-SR', short: 'Samarbejde', icon: 'samarbejde', badge: '12 spørgsmål',
    instruction: 'Nedenstående udsagn beskriver, hvordan man kan opleve samarbejdet med sin psykolog. Tænk på jeres seneste samtale, når du svarer.',
    options: WAISR_OPTS, max: 72,
    items: [
      'Psykologen og jeg er enige om, hvad der er vigtigt for mig at arbejde med',
      'Det vi foretager os i behandlingen, giver mig en ny måde at se mit problem på',
      'Jeg tror på, at psykologen kan hjælpe mig',
      'Psykologen og jeg er enige om, hvad der skal til for, at min situation kan forbedres',
      'Jeg tror på, at det vi laver, vil hjælpe mig med at nå mine mål',
      'Psykologen og jeg har en god forståelse af, hvilke mål vi arbejder hen imod',
      'Jeg har respekt for og tillid til psykologen',
      'Vi har en god forståelse af den slags forandringer, der ville være gode for mig',
      'Psykologen og jeg samarbejder om at opstille mål for min behandling',
      'Psykologen udviser omsorg for mig, også når jeg gør ting, som vedkommende ikke kan lide',
      'Psykologen og jeg stoler på hinanden',
      'Vi er enige om de ting, jeg skal gøre i behandlingen',
    ],
  },
};

// ════════════════════════════════════════════════════════════════════════
//  SØVNDAGBOG - udskifteligt indholds-modul (B5 swap-arkitektur)
// ════════════════════════════════════════════════════════════════════════
// DROP-IN-KONTRAKT: dette objekt er CSD-INDHOLDET (felt-listen) holdt ISOLERET
// fra render-motoren (renderDiary i index.html) + krypto/akkumulering. En
// egen-forfattet variant til Companion-distribution kan erstatte HELE
// `CSD_SOEVNDAGBOG` med samme `{kind:'diary', fields:[…]}`-shape uden at røre
// render/krypto/persistens. Felt-`kind` (time|number|scale|text) er det eneste
// render-motoren kender → indholdet er frit udskifteligt.
//
// NU (Viktors egen praksis): ÆGTE Consensus Sleep Diary (Carney et al. 2012,
// SLEEP 35(2):287-302 - "The Consensus Sleep Diary: Standardizing prospective
// sleep self-monitoring"). Fri klinisk brug. Gengivet uændret med kildeangivelse.
// Felterne følger CSD-M (morgen-versionen): udfyldes om morgenen for natten der gik.
export const CSD_SOEVNDAGBOG = {
  id: 'soevndagbog', kind: 'diary', title: 'Søvndagbog', short: 'Søvndagbog', icon: 'maane',
  badge: 'én gang om morgenen',
  attribution: 'Consensus Sleep Diary (Carney et al., 2012, SLEEP). Gengivet uændret med kildeangivelse.',
  instruction: 'Udfyld om morgenen for natten, der lige er gået. Svar så godt du kan. Du behøver ikke kigge på uret om natten, et skøn er fint. Der er ingen rigtige eller forkerte svar.',
  fields: [
    { key: 'bedtime',         kind: 'time',   text: 'Hvad tid gik du i seng i aftes?' },
    { key: 'lightsOut',       kind: 'time',   text: 'Hvad tid forsøgte du at falde i søvn (slukkede lyset)?',
      hint: 'Tit samme tid som du gik i seng, men hvis du lå og læste eller var på mobilen lidt først, så skriv hvornår du faktisk prøvede at sove. Samme tid er helt fint.' },
    { key: 'sleepLatencyMin', kind: 'number', text: 'Hvor lang tid tog det dig at falde i søvn?', unit: 'minutter', min: 0, max: 600 },
    { key: 'awakeningsCount', kind: 'number', text: 'Hvor mange gange vågnede du i løbet af natten (ud over den endelige opvågning)?', unit: 'gange', min: 0, max: 30 },
    { key: 'awakeningsMin',   kind: 'number', text: 'Hvor længe var du vågen i alt under disse opvågninger?', unit: 'minutter', min: 0, max: 600 },
    { key: 'finalAwake',      kind: 'time',   text: 'Hvad tid vågnede du endeligt?' },
    { key: 'outOfBed',        kind: 'time',   text: 'Hvad tid stod du op af sengen?' },
    { key: 'quality',         kind: 'scale',  text: 'Hvordan vil du vurdere kvaliteten af din søvn?',
      scale: ['Meget dårlig', 'Dårlig', 'Nogenlunde', 'God', 'Meget god'] },
    // Ingen `default` - et felt må ALDRIG bære en committed default der tæller som
    // svar (spec-ux-soevndagbog-udfyldning §1: fantom-defaults korrumperer kliniske
    // data). Tomt = ubesvaret. Det eneste der må forudfylde er "Samme som i går".
    { key: 'naps',            kind: 'text',   text: 'Tog du dig en lur eller blund i løbet af gårsdagen? (antal og samlet varighed, valgfrit)', optional: true },
    { key: 'substans',        kind: 'substans', ramme: 'igaar', text: 'Tog du søvnmedicin, alkohol eller koffein i går?', optional: true },
  ],
};

// Registrér søvndagbogen i SKEMAER (men IKKE i SKEMA_ORDER - den er en
// standalone monitorerings-dagbog, aldrig en del af det booking-koblede
// spørgeskema-batteri).
SKEMAER.soevndagbog = CSD_SOEVNDAGBOG;

// ════════════════════════════════════════════════════════════════════════
//  SØVN-BASELINE - engangs intake-skema (IKKE-akkumulerende)
// ════════════════════════════════════════════════════════════════════════
// Adskilt fra den daglige CSD: sendes ÉN gang ved forløbs-start, udfyldes én
// gang, deles én gang. KUN deskriptive/kontekst-variable (data-minimering,
// GDPR) - hver variabel ændrer en klinisk beslutning (spec-baseline-intake §1).
// D3-SIKKERHEDSSCREEN (epilepsi/bipolar/OSA/suicidalitet/…) er BEVIDST IKKE her:
// den hører i Viktors kliniske intake (B-Q1/Riemann "clinical interview"), ikke
// et self-serve-link. Nul-score: ingen tolkning vises klienten.
export const SOEVN_BASELINE = {
  id: 'soevn-baseline', kind: 'baseline', title: 'Kort baseline om din søvn', short: 'Baseline', icon: 'maane',
  badge: 'udfyldes én gang',
  instruction: 'Et kort engangs-skema om din søvn og dine vaner. Det hjælper din psykolog med at tilpasse forløbet til dig. Der er ingen rigtige eller forkerte svar.',
  fields: [
    { key: 'alder',            kind: 'number', text: 'Hvor gammel er du?', unit: 'år', min: 0, max: 120 },
    { key: 'koen',             kind: 'radio',  text: 'Køn',
      options: ['Kvinde', 'Mand', 'Andet / vil ikke oplyse'] },
    { key: 'undertype',        kind: 'radio',  text: 'Hvad passer bedst på dine søvnvanskeligheder?',
      options: ['Svært ved at falde i søvn i starten af natten', 'Vågner meget i løbet af natten', 'Vågner for tidligt om morgenen', 'En blanding'] },
    { key: 'varighed',         kind: 'radio',  text: 'Hvor længe har du haft søvnvanskeligheder?',
      options: ['Under 3 måneder', '3 måneder eller mere'] },
    { key: 'substans',         kind: 'substans', ramme: 'vanligt', text: 'Dit vanlige mønster: søvnmedicin, alkohol eller koffein?', optional: true },
    { key: 'lure',             kind: 'radio',  text: 'Tager du dig lure i dagtimerne?',
      options: ['Nej', 'Ja, under 30 min', 'Ja, 30-60 min', 'Ja, over 60 min'] },
    { key: 'vanligOpvaagning', kind: 'time',   text: 'Hvad tid står du normalt op om morgenen?' },
  ],
};
SKEMAER['soevn-baseline'] = SOEVN_BASELINE;

// ════════════════════════════════════════════════════════════════════════
//  SCORING (intern - bruges til opaque payload; klienten ser ALDRIG resultatet)
// ════════════════════════════════════════════════════════════════════════
function val(a) { return (a && typeof a === 'object') ? a.value : a; }
function sumSkema(answers, id) {
  const a = answers[id]; if (!a) return null;
  return Object.values(a).reduce((s, x) => s + (Number(val(x)) || 0), 0);
}
function itemsInt(answers, id) {
  const a = answers[id] || {}, out = {};
  for (const k of Object.keys(a)) out['q' + k] = Number(val(a[k])) || 0;
  return out;
}

export function computeScores(answers) {
  const out = {};
  if (answers.phq9)  out.phq9  = { total: sumSkema(answers, 'phq9'),  max: 27 };
  if (answers.gad7)  out.gad7  = { total: sumSkema(answers, 'gad7'),  max: 21 };
  if (answers.who5) { const raw = sumSkema(answers, 'who5'); out.who5 = { total: raw, max: 25, percent: raw * 4 }; }
  if (answers.wsas)  out.wsas  = { total: sumSkema(answers, 'wsas'),  max: 40 };
  if (answers.waisr) out.waisr = { total: sumSkema(answers, 'waisr'), max: 72 };
  if (answers.cas) {
    const c = answers.cas;
    const components = {
      worry: Number(val(c[0])) || 0, rumination: Number(val(c[1])) || 0,
      threat: Number(val(c[2])) || 0, avoidance: Number(val(c[3])) || 0,
    };
    const total = Math.round((components.worry + components.rumination + components.threat + components.avoidance) / 4);
    out.cas = { total, components };
  }
  if (answers.mcb) {
    const m = answers.mcb;
    out.mcb = { ratings: SKEMAER.mcb.items.map((it, i) => ({ key: it.key, rating: Number(val(m[i])) || 0 })) };
  }
  return out;
}

// ════════════════════════════════════════════════════════════════════════
//  INGEST-KONVOLUT (transport-form - matcher app IngestKonvolut)
// ════════════════════════════════════════════════════════════════════════
// Producent-side envelope-wrap (PR-2): web emitterer den ÆGTE konvolut-form
// {schemaVersion, schemaType, clientTimestamp, data, clientUA} i stedet for en
// flad payload. Den hidtidige FLADE payload pakkes UÆNDRET i `data` (0 tab).
// App-adapteren (IngestKonvolutAdapter.normalisér) ser dermed `.konvolutDirekte`
// - ingen felt-syntese - mens gamle flade containere fortsat dekoder
// (.fladCSD/.fladBatteri). Felt-kontrakt: IngestEnvelopeDecryptor.swift /
// IngestKonvolutRouter.swift. clientUA='web' = ærlig kanal-markør (kontrakt §6,
// valgfrit) → føder app §8.4-adherence. respondentPseudonym sættes IKKE web-side
// (kommer fra poll-/fil-laget - adapter-note, ikke payload).
// NB: RØR ALDRIG skema-felt-definitionerne (CSD_SOEVNDAGBOG osv.) - kun
// payload-BYGGERNE wrappes (transport-form, ikke skema-felter).
function buildIngestKonvolut(data, { schemaType, schemaVersion, clientTimestamp } = {}) {
  return {
    schemaVersion,
    schemaType,
    clientTimestamp,
    data,
    clientUA: 'web',
  };
}

// ════════════════════════════════════════════════════════════════════════
//  PAYLOAD (TerapiEksportPayload-shape - matcher E2EKryptering.swift)
// ════════════════════════════════════════════════════════════════════════
function isoNoFrac(d) { return d.toISOString().replace(/\.\d{3}Z$/, 'Z'); }

export function buildPayload(answers, meta = {}) {
  const now = isoNoFrac(new Date());
  const sessionNumber = (meta.sessionNumber != null) ? meta.sessionNumber : null;
  const s = computeScores(answers);

  const questionnaireScores = [];
  for (const id of ['gad7', 'phq9', 'who5', 'wsas', 'waisr']) {
    if (!s[id]) continue;
    const sub = itemsInt(answers, id);
    if (id === 'who5') sub.percent = s.who5.percent;
    questionnaireScores.push({
      type: id,
      completedAt: now,
      weekNumber: sessionNumber,
      totalScore: s[id].total,
      subscaleScores: sub,
    });
  }

  const payload = {
    version: 1,
    exportedAt: now,
    clientName: meta.name || '',
    therapistName: 'Viktor Nielsen',
    categories: Object.keys(answers),
    questionnaireScores,
  };

  if (s.cas) {
    payload.casTrends = [{
      date: now,
      totalScore: s.cas.total,
      componentScores: s.cas.components,
      intensityRating: s.cas.total,
      durationMinutes: 0,
      dmAttempted: false,
    }];
  }
  if (s.mcb) {
    payload.beliefRatings = s.mcb.ratings.map((r) => ({
      date: now,
      beliefText: SKEMAER.mcb.items.find((it) => it.key === r.key).text,
      category: r.key,
      rating: r.rating,
    }));
  }
  // Envelope-wrap (PR-2): flad payload UÆNDRET i `data`; konvolut-felter afledt af
  // payloadens egne værdier (categories[0]→schemaType, version→schemaVersion,
  // exportedAt→clientTimestamp). Fallback-schemaType matcher app-adapterens flad-batteri-gren.
  return buildIngestKonvolut(payload, {
    schemaType: payload.categories[0] || 'questionnaire-batteri',
    schemaVersion: payload.version,
    clientTimestamp: payload.exportedAt,
  });
}

// ════════════════════════════════════════════════════════════════════════
//  SØVNDAGBOG-PAYLOAD (akkumuleret periode → ÉN opaque eksport)
// ════════════════════════════════════════════════════════════════════════
// REN data-capture: payloaden bærer KUN de rå dagbogs-felter (ingen scoring,
// ingen TST/SE) - nul-score-invarianten bevares, og den AUTORITATIVE
// TST/SE-beregning sker Mentem-side (Swift `Soevnberegning`), så formlen har
// én sandhedskilde. `sleepDiary` er en NY gren ved siden af questionnaireScores
// /casTrends/beliefRatings; Swift `TerapiEksportPayload` ignorerer ukendte
// felter ved decode → bagudkompatibelt (fuld ingest-persistens = flagget P2-
// schema-touch, ikke Fase 1).
//
// `entries` = array af { date:'YYYY-MM-DD', bedtime, lightsOut, sleepLatencyMin,
//   awakeningsCount, awakeningsMin, finalAwake, outOfBed, quality, naps?, medication? }.
// Versionering (persistens-spec §5/§6, G2). Additivt på formatVersion:1.
export const SCHEMA_VERSION = 1;          // payload-strukturversion
export const CONTENT_VERSION = 1;         // CSD-indholdsversion (bump = kun NYE forløb, G2-frys)
export const PROTOCOL_VERSION = 1;        // draft-store transport-kontrakt
export const SITE_BUILD = '2026-06-01-fase1';   // synlig version-stamp (G3)

export function buildPayloadCSD(entries, meta = {}) {
  const now = isoNoFrac(new Date());
  const FIELD_KEYS = CSD_SOEVNDAGBOG.fields.map((f) => f.key);

  const sleepDiary = (entries || []).map((e) => {
    const out = { date: e.date };
    for (const k of FIELD_KEYS) if (e[k] != null && e[k] !== '') out[k] = e[k];
    return out;
  });

  const startedAt = meta.startedAt || (sleepDiary[0] && sleepDiary[0].date) || now;

  const data = {
    version: 1,
    exportedAt: now,
    clientName: meta.name || '',
    therapistName: 'Viktor Nielsen',
    categories: ['soevndagbog'],
    diaryType: 'consensus-sleep-diary',
    diaryStartedAt: startedAt,
    plannedDays: (meta.plannedDays != null) ? meta.plannedDays : null,
    // Art.9-samtykke (server-opbevaring) - data-minimalt, INDE i ciphertext.
    // Additivt: ældre containere mangler feltet (=> null), ingen krypto-/format-
    // ændring, ingen migration. Localstorage-variant => null (intet samtykke krævet).
    consent: meta.consent || null,
    // Versions-blok (§6) - klartekst INDE i ciphertext (serveren ser den aldrig).
    meta: {
      schemaVersion: SCHEMA_VERSION,
      contentVersion: (meta.contentVersion != null) ? meta.contentVersion : CONTENT_VERSION,
      instrument: 'CSD-Carney-2012',
      protocolVersion: PROTOCOL_VERSION,
      siteBuild: SITE_BUILD,
      forloebId: meta.forloebId || null,          // = token (mapping kun i Mentem)
      periodPlanned: (meta.plannedDays != null) ? meta.plannedDays : null,
      periodCompleted: sleepDiary.length,
      startedAt,
      endedAt: meta.endedAt || null,
    },
    sleepDiary,
  };

  // Envelope-wrap (PR-2): flad CSD-payload UÆNDRET i `data`; konvolut-felter afledt
  // (categories[0]→schemaType, meta.schemaVersion→schemaVersion, exportedAt→clientTimestamp).
  return buildIngestKonvolut(data, {
    schemaType: data.categories[0],
    schemaVersion: data.meta.schemaVersion,
    clientTimestamp: data.exportedAt,
  });
}

// ════════════════════════════════════════════════════════════════════════
//  DRAFT-MERGE (newest-wins pr. entry-dato) - readable-side reconcile
// ════════════════════════════════════════════════════════════════════════
// Bruges hvor BEGGE sider er læsbare plaintext-entries (fx Mentem-decrypt-side,
// eller fremtidig klient-læsbar kladde). Server-draften er pinned-key-ciphertext
// → klienten kan IKKE læse den (asymmetrisk, §1 "ingen ny primitiv"); klientens
// ITP-recovery sker derfor på BLOB-niveau (hele krypterede kladde overlever).
// newest-wins via `savedAt`; server-authoritative ved tie/manglende stempel.
export function mergeDiaryEntries(localEntries, serverEntries) {
  const byDate = new Map();
  for (const e of (serverEntries || [])) byDate.set(e.date, e);      // server-baseline (authoritative)
  for (const e of (localEntries || [])) {
    const ex = byDate.get(e.date);
    if (!ex) { byDate.set(e.date, e); continue; }
    if ((e.savedAt || '') > (ex.savedAt || '')) byDate.set(e.date, e); // lokal strengt nyere → vinder
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

// ════════════════════════════════════════════════════════════════════════
//  SØVN-BASELINE-PAYLOAD (engangs intake → opaque eksport)
// ════════════════════════════════════════════════════════════════════════
// Ren data-capture (nul-score). Ny gren `payload.baseline = {…}` ved siden af
// questionnaireScores/casTrends/beliefRatings/sleepDiary. Swift ignorerer
// ukendte felter ved decode → bagudkompatibelt (fuld ingest = P2-schema-touch,
// ikke Fase 1; standalone-visning først, Q5).
export function buildPayloadBaseline(answers, meta = {}) {
  const now = isoNoFrac(new Date());
  const baseline = {};
  for (const f of SOEVN_BASELINE.fields) {
    const v = answers[f.key];
    if (v != null && v !== '') baseline[f.key] = v;
  }
  return {
    version: 1,
    exportedAt: now,
    clientName: meta.name || '',
    therapistName: 'Viktor Nielsen',
    categories: ['soevn-baseline'],
    baselineType: 'soevn-intake',
    baseline,
  };
}

// ════════════════════════════════════════════════════════════════════════
//  FORLØBS-ANMODNING (ANMOD-V1) - ingest-skema "forloebs-anmodning"
// ════════════════════════════════════════════════════════════════════════
// FROSSET kontrakt: noter/contract-forloebs-anmodning-ingest-2026-06-19.md (§1–§3),
// afledt 1:1 af PsykologInvitation/ForloebsAnmodningKonvolut.swift (parser = ground-truth).
// Web-form OG app-submit-UI OG bakke-parser SKAL matche §1–§3 byte-for-byte (kontrakt-drift
// = søvndagbog-ULÆSELIG-rod). Den FLADE §2-payload pakkes i `data` på SAMME envelope-wrap-måde
// som søvndagbog (buildIngestKonvolut → {schemaVersion, schemaType, clientTimestamp, data, clientUA}).
// Krypto er UÆNDRET (mentemEncrypt mod INGEST-X25519-pubkey, zero-knowledge - siden har KUN
// public-key). RØR ALDRIG skema-felt-definitionerne; kun transport-formen tilføjes her.

export const ANMOD_SCHEMA_TYPE = 'forloebs-anmodning';   // §1 AUTORITATIV wire-streng (ren ASCII, ø→oe)

// §2 enums (wire-værdier - IKKE visningstekst). v2.1 (adaptiv-grundlags-betinget):
//   grundlag 4→3-vejs; FJERNET forloebstype/holdDag/holdTid; TILFØJET henvisning_psykiater/
//   forloeb_tilbudt/tid_praeference. forloeb_resolved er SYSTEM-AFLEDT (aldrig på wire).
export const ANMOD_GRUNDLAG             = ['psykiater', 'forsikring', 'egenbetaler'];
export const ANMOD_HENVISNING_PSYKIATER = ['vestegnsklinikken', 'westergaard', 'ved_ikke']; // KUN psykiater (valgfri)
export const ANMOD_FORLOEB_TILBUDT      = ['gruppe', 'individuelt', 'ved_ikke'];             // KUN psykiater (REQ); = TILBUDT
export const ANMOD_TID_DAGE             = ['tirsdag', 'onsdag', 'torsdag', 'fredag'];        // KUN forloeb_tilbudt=gruppe
export const ANMOD_TID_TIDER            = ['14:00', '15:30'];                                // KUN forloeb_tilbudt=gruppe
export const ANMOD_TID_VED_IKKE         = 'ved_ikke';                                        // "Ved ikke endnu" → wire-token
// Grundlag der STILLER psykiater-grenens spørgsmål (henvisning + forloeb_tilbudt) i UI.
export const ANMOD_SPOERG_PSYKIATER     = ['psykiater'];

// §6 art.9-deny - disse keys må ALDRIG bære helbreds-/CPR-data; til stede => hård parse-fejl.
export const ANMOD_ART9_DENY = ['cpr', 'helbred', 'diagnose', 'diagnosis', 'medicin', 'sygdom', 'symptom', 'health', 'journal'];

// §2 visningsnavne (korrekt æøå - IKKE wire-værdier). Single source for web + app.
// Psykiater-klinik: personnavn (Hoff/Westergaard) er display-only (wire = klinik-id).
export const ANMOD_DISPLAY = {
  grundlag:            { psykiater: 'Henvist via egen læge til psykiater', forsikring: 'Via forsikring', egenbetaler: 'Egenbetaler' },
  henvisning_psykiater:{ vestegnsklinikken: 'Vestegnsklinikken (Andreas Hoff)', westergaard: 'Westergaard Psykiatri (Casper Westergaard)', ved_ikke: 'Ved ikke' },
  forloeb_tilbudt:     { gruppe: 'Gruppeforløb', individuelt: 'Individuelt forløb', ved_ikke: 'Ved ikke' },
  tid_dage:            { tirsdag: 'Tirsdag', onsdag: 'Onsdag', torsdag: 'Torsdag', fredag: 'Fredag' },
  tid_tider:           { '14:00': 'kl. 14:00', '15:30': 'kl. 15:30' },
  tid_ved_ikke:        'Ved ikke endnu',
};

// §2b PINNET samtykke-ordlyd (wording-version v2-2026-06-19, em-dash-fri): renderes PRÆCIST på
// BEGGE flader (web + app). `[privatlivspolitikken]` = dp.dk-skabelon-link-TODO (interim-placeholder).
// Brand siger ALTID "Psykolog Viktor Nielsen", ALDRIG "Mycel". Betydning UÆNDRET fra v1-interim
// (kun em-dash → komma; endelig jur. ordlyd stadig pending review).
export const ANMOD_CONSENT_WORDING_VERSION = 'v2-2026-06-19';
export const ANMOD_CONSENT_WORDING =
  'Jeg samtykker til, at Psykolog Viktor Nielsen behandler de oplysninger, jeg giver i denne anmodning, '
  + 'herunder at oplysningerne kan afsløre, at jeg søger psykologbehandling, med det formål at behandle '
  + 'og besvare min anmodning om forløbsadgang. Jeg kan til enhver tid trække anmodningen og mit samtykke '
  + 'tilbage. Læs hvordan dine oplysninger behandles i [privatlivspolitikken].';

function anmodFejl(code, felt) {
  const e = new Error(felt ? `${code}:${felt}` : code);
  e.code = code; if (felt) e.felt = felt;
  return e;
}
function anmodText(v, felt) {
  if (typeof v !== 'string' || !v.trim()) throw anmodFejl('paakraevet_mangler', felt);
  return v.trim();
}
function anmodEnum(v, allow, felt) {
  if (!allow.includes(v)) throw anmodFejl('ugyldig_enum', felt);
  return v;
}

// tid_praeference (KUN forloeb_tilbudt=gruppe): null (udeladt) | 'ved_ikke' | {dage:[...],tider:[...]}
// (enum-valideret, dedup'et; tom-tom → 'ved_ikke'). 1:1 m. Swift parseTidPraeference.
function byggTidListe(arr, allow, felt) {
  if (arr === null || arr === undefined) return [];
  if (!Array.isArray(arr)) throw anmodFejl('ugyldig_tid_praeference', felt);
  const out = [];
  for (const el of arr) {
    if (!allow.includes(el)) throw anmodFejl('ugyldig_enum', felt);
    if (!out.includes(el)) out.push(el);
  }
  return out;
}
function byggTidPraeference(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'string') {
    if (v === ANMOD_TID_VED_IKKE) return ANMOD_TID_VED_IKKE;
    throw anmodFejl('ugyldig_tid_praeference', 'tid_praeference');
  }
  if (typeof v !== 'object' || Array.isArray(v)) throw anmodFejl('ugyldig_tid_praeference', 'tid_praeference');
  const dage  = byggTidListe(v.dage,  ANMOD_TID_DAGE,  'tid_dage');
  const tider = byggTidListe(v.tider, ANMOD_TID_TIDER, 'tid_tider');
  if (dage.length === 0 && tider.length === 0) return ANMOD_TID_VED_IKKE;
  return { dage, tider };
}

/// Byg den FROSNE forløbs-anmodnings-konvolut fra rå form-input (fail-loud).
/// Validerer §2 (påkrævede felter + enums + gruppe-eksklusiv slot + atten/samtykke=true +
/// art.9-deny) og wrapper i IngestKonvolut (§3). Kaster Error med `.code`/`.felt` ved afvigelse
/// (kalderen mapper til en dansk fejlbesked). Returnerer konvolut-objektet (klar til mentemEncrypt).
export function buildAnmodKonvolut(input = {}) {
  // §6 art.9-deny FØRST: en lækket flade må aldrig kunne importere art.9-data tavst.
  for (const k of Object.keys(input)) {
    if (ANMOD_ART9_DENY.includes(String(k).toLowerCase())) throw anmodFejl('art9Forbudt', k);
  }

  // Rækkefølge 1:1 med Swift-parseren (ForloebsAnmodningKonvolut.parse): fornavn/efternavn →
  // grundlag → atten → samtykke → forloebstype → hold-slot (samme fejl-præcedens).
  const data = { type: ANMOD_SCHEMA_TYPE };                 // informativ mirror (parseren keyer på konvolut-schemaType)
  data.fornavn   = anmodText(input.fornavn, 'fornavn');
  data.efternavn = anmodText(input.efternavn, 'efternavn');
  data.grundlag  = anmodEnum(input.grundlag, ANMOD_GRUNDLAG, 'grundlag');

  if (input.atten !== true)         throw anmodFejl('atten_paakraevet', 'atten');           // 18+ gate, MÅ være true
  data.atten = true;
  if (input.anmodSamtykke !== true) throw anmodFejl('samtykke_paakraevet', 'anmodSamtykke'); // art.9(2)(a), MÅ være true
  data.anmodSamtykke = true;

  // forloeb_resolved er SYSTEM-AFLEDT (Swift-side: grundlag∈{forsikring,egenbetaler} → "individuelt").
  // Det er ALDRIG et wire-felt → en flade må ikke smugle det ind (defense-in-depth; 1:1 m. parseren,
  // der afviser forloeb_resolved på wire). Bygges derfor ALDRIG ind i `data`.
  if (input.forloeb_resolved != null && input.forloeb_resolved !== '') {
    throw anmodFejl('forloeb_resolved_ikke_tilladt', 'forloeb_resolved');
  }

  // v2.1 adaptiv forgrening (grundlag styrer; fail-loud kryds-felt-validering, 1:1 m. Swift-parseren).
  const erPsykiater = ANMOD_SPOERG_PSYKIATER.includes(data.grundlag);
  const hRaw  = (input.henvisning_psykiater != null && input.henvisning_psykiater !== '') ? input.henvisning_psykiater : null;
  const tRaw  = (input.forloeb_tilbudt      != null && input.forloeb_tilbudt      !== '') ? input.forloeb_tilbudt      : null;
  const tidIn = (input.tid_praeference      != null && input.tid_praeference      !== '') ? input.tid_praeference      : null;

  if (erPsykiater) {
    // henvisning_psykiater: VALGFRI (udeladt/ved_ikke ok); enum-valideret hvis angivet.
    if (hRaw !== null) data.henvisning_psykiater = anmodEnum(hRaw, ANMOD_HENVISNING_PSYKIATER, 'henvisning_psykiater');
    // forloeb_tilbudt: REQUIRED (semantik = hvad psykiateren har TILBUDT, ikke ønsket).
    if (tRaw === null) throw anmodFejl('paakraevet_mangler', 'forloeb_tilbudt');
    data.forloeb_tilbudt = anmodEnum(tRaw, ANMOD_FORLOEB_TILBUDT, 'forloeb_tilbudt');
    // tid_praeference: tilladt KUN iff forloeb_tilbudt=gruppe (FORBUDT ellers).
    if (data.forloeb_tilbudt === 'gruppe') {
      const tp = byggTidPraeference(tidIn);          // null (udeladt) | 'ved_ikke' | {dage,tider}
      if (tp !== null) data.tid_praeference = tp;
    } else if (tidIn !== null) {
      throw anmodFejl('tid_praeference_ikke_tilladt', 'tid_praeference');
    }
  } else {
    // forsikring/egenbetaler: psykiater-grenens felter FORBUDT (fail-loud). forloeb_resolved afledes
    // Swift-side ("individuelt - fast") - bygges ALDRIG ind i wire-payloaden her.
    if (hRaw  !== null) throw anmodFejl('henvisning_ikke_tilladt', 'henvisning_psykiater');
    if (tRaw  !== null) throw anmodFejl('forloeb_tilbudt_ikke_tilladt', 'forloeb_tilbudt');
    if (tidIn !== null) throw anmodFejl('tid_praeference_ikke_tilladt', 'tid_praeference');
  }

  // S1 (v2.1): telefon PÅKRÆVET (adgangslinket sendes via SMS) => fail-loud hvis tom/whitespace.
  // email VALGFRI (anbefales for desktop). FJERNET det kombinerede `kontakt`-felt.
  if (typeof input.telefon !== 'string' || !input.telefon.trim()) throw anmodFejl('telefonPaakraevet', 'telefon');
  data.telefon = input.telefon.trim();
  // Valgfri: tom/whitespace => behandles som fraværende (udeladt af payload).
  if (typeof input.email === 'string' && input.email.trim()) data.email = input.email.trim();
  if (typeof input.note === 'string'  && input.note.trim())  data.note  = input.note.trim();

  return buildIngestKonvolut(data, {
    schemaType: ANMOD_SCHEMA_TYPE,
    schemaVersion: 1,
    clientTimestamp: isoNoFrac(new Date()),
  });
}

// ════════════════════════════════════════════════════════════════════════
//  KEY-PINNING (sikkerheds-hærdning, P1a) - trust anchor i siden
// ════════════════════════════════════════════════════════════════════════
// Mentems E2E X25519-public-key er PINNED i koden - IKKE taget fra ?pk=-URL-
// feltet. Det forhindrer en manipuleret URL i at få klienten til at kryptere
// helbredsdata til en FREMMED nøgle (attacker-in-the-middle via link).
// KRYPTO-GUARD: kun den OFFENTLIGE nøgle her. Rotation = redeploy med ny
// PINNED_PUBKEY + bump af PINNED_KEY_ID (stemples i hver container → Mentem
// kan detektere nøgle-version-mismatch ved decrypt).
//
// PINNED_KEY_ID = første 8 hex af SHA-256(rå 32-byte pubkey).
export const PINNED_PUBKEY = 'M8LHgVyDALEoCtm_Q6C2dZ73qPHvqy8VGtiLUiSjUwI';
export const PINNED_KEY_ID = '8aa536a1';

/// Normalisér en nøgle til sammenligning (base64url/base64 + uden padding).
function normKey(k) {
  return (k || '').replace(/-/g, '+').replace(/_/g, '/').replace(/=+$/, '').trim();
}

/// Afgør hvilken modtager-nøgle der må krypteres til. PINNED er autoritativ.
/// - intet ?pk= → brug pinned.
/// - ?pk= == pinned (uanset base64/base64url) → ok.
/// - ?pk= != pinned → AFVIS (krypter ALDRIG til en fremmed nøgle).
/// Returnerer { ok, key, keyId, reason }.
export function resolveRecipientKey(pkParam) {
  if (pkParam && normKey(pkParam) !== normKey(PINNED_PUBKEY)) {
    return { ok: false, reason: 'mismatch' };
  }
  return { ok: true, key: PINNED_PUBKEY, keyId: PINNED_KEY_ID };
}

// ════════════════════════════════════════════════════════════════════════
//  KRYPTO - public-key-only opaque output (R3)
// ════════════════════════════════════════════════════════════════════════
function b64ToBytes(b64) {
  // Accepter både standard-base64 OG base64url (?pk=-transport).
  let s = b64.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  if (typeof Buffer !== 'undefined') return Uint8Array.from(Buffer.from(s, 'base64'));
  const bin = atob(s); const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function bytesToB64(bytes) {
  const u = new Uint8Array(bytes);
  if (typeof Buffer !== 'undefined') return Buffer.from(u).toString('base64');
  let bin = ''; for (let i = 0; i < u.length; i++) bin += String.fromCharCode(u[i]);
  return btoa(bin);
}

/// 🔴 SHIP-GATE-FLAG: aktivér den rene-JS X25519-fallback (browser-uafhængig kryptering).
/// DEFAULT false => uændret adfærd (X25519-løse browsere får "åbn i Chrome/Safari"; fallback
/// er dormant). Flip til true KUN efter BEGGE gates er grønne:
///   1. test/x25519-fallback-roundtrip.mjs (JS-side, RFC-vektorer + WebCrypto-oracle).
///   2. app-side CryptoKit-roundtrip (StaticSiteCryptoRoundTripTests mod en fallback-container,
///      via `node test/encrypt-fixture.mjs <pub> --force-fallback`) + Viktor-GO.
/// Aktivering uden den gate => risiko for silent decrypt-fail (værre end den synlige fejl nu).
export const X25519_FALLBACK_AKTIV = true;

/// Findes WebCrypto subtle + secure context (forudsætning for HKDF+AES-GCM, som begge stier bruger)?
/// `isSecureContext` er undefined i Node (CryptoKit-gate-harnessen), hvor subtle altid er sikker;
/// bloker derfor KUN når den eksplicit er false (usikker http-browser-kontekst).
function subtleTilgaengelig() {
  const s = globalThis.crypto && globalThis.crypto.subtle;
  return !!s && globalThis.isSecureContext !== false;
}

/// Feature-test: understøtter crypto.subtle X25519? Ældre/indlejrede Android-browsere mangler
/// primitiven (selv når subtle findes) => nøglegenerering kaster. Cachet (ét forsøg pr. side-load).
let _x25519WC = null;
async function x25519WebCryptoStoettet() {
  if (_x25519WC !== null) return _x25519WC;
  try {
    if (!subtleTilgaengelig()) { _x25519WC = false; return false; }
    await globalThis.crypto.subtle.generateKey({ name: 'X25519' }, true, ['deriveBits']);
    _x25519WC = true;
  } catch (_e) { _x25519WC = false; }
  return _x25519WC;
}

/// "Kan vi faktisk kryptere?" Feature-detektér FØR udfyldning/Send. Med fallback AKTIV rækker
/// WebCrypto subtle (X25519-hullet dækkes af ren-JS-fallbacken); uden fallback (default) kræves
/// WebCrypto-X25519. Bruges af klient-UI til banner/fejl-besked.
export async function kryptoStoettet() {
  if (!subtleTilgaengelig()) return false;
  if (X25519_FALLBACK_AKTIV) return true;
  return await x25519WebCryptoStoettet();
}

/// Krypter et payload-objekt mod modtagerens X25519-public-key (base64 / base64url).
/// Returnerer et KrypteretEksportContainer-objekt (klar til JSON.stringify).
/// `keyId` stemples i containeren (default = PINNED_KEY_ID) så Mentem kan
/// detektere nøgle-version-mismatch ved decrypt. Swift-decrypt ignorerer
/// ukendte felter → bagudkompatibelt.
export async function mentemEncrypt(recipientPubB64, payloadObj, keyId = PINNED_KEY_ID, opts = {}) {
  // Forudsætning: WebCrypto subtle (HKDF+AES-GCM, som begge ECDH-stier bruger). Mangler den,
  // kast en TYPET fejl FØR vi rører nøgler/data, så kalderen viser "åbn i Chrome/Safari" i
  // stedet for en generisk krypto-fejl.
  if (!subtleTilgaengelig()) {
    const err = new Error('WebCrypto (subtle) er ikke tilgængelig i denne browser');
    err.name = 'CryptoUnsupportedError';
    throw err;
  }
  const subtle = globalThis.crypto.subtle;
  const recipientPubBytes = b64ToBytes(recipientPubB64);

  // ECDH-sti-valg. PRIMÆR: WebCrypto-X25519 (uændret). FALLBACK: ren-JS X25519 (RFC 7748,
  // byte-eksakt mod WebCrypto/CryptoKit; se test/x25519-fallback-roundtrip.mjs). Krypto-outputtet
  // (format/contract) er identisk i begge stier, så zero-knowledge er urørt. opts.tvingFallback
  // tvinger fallback-stien (kun til roundtrip-fixturen / CryptoKit-gaten).
  const x25519WC = await x25519WebCryptoStoettet();
  const brugFallback = opts.tvingFallback === true || (!x25519WC && X25519_FALLBACK_AKTIV);
  if (!x25519WC && !brugFallback) {
    const err = new Error('X25519-WebCrypto er ikke understøttet i denne browser');
    err.name = 'CryptoUnsupportedError';
    throw err;
  }

  // Rå 32-byte ephemeral public key + shared secret (sti-uafhængigt format; fresh ephemeral
  // pr. kryptering giver forward secrecy). Matcher CryptoKit sharedSecretFromKeyAgreement.
  let ephPubRaw, shared;
  if (brugFallback) {
    const { x25519 } = await import('./mentem-x25519-fallback.js');
    const ephPriv = x25519.utils.randomPrivateKey();
    ephPubRaw = x25519.getPublicKey(ephPriv);
    shared = x25519.getSharedSecret(ephPriv, recipientPubBytes);
  } else {
    const recipientPub = await subtle.importKey('raw', recipientPubBytes, { name: 'X25519' }, false, []);
    const eph = await subtle.generateKey({ name: 'X25519' }, true, ['deriveBits']);
    ephPubRaw = new Uint8Array(await subtle.exportKey('raw', eph.publicKey));
    shared = new Uint8Array(await subtle.deriveBits({ name: 'X25519', public: recipientPub }, eph.privateKey, 256));
  }

  // HKDF-SHA256 (salt random 32B, info låst til Mentem-kontrakten).
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(32));
  const ikm = await subtle.importKey('raw', shared, 'HKDF', false, ['deriveBits']);
  const keyBits = await subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt, info: new TextEncoder().encode('TherapyCopilot-E2E-Export-v1') },
    ikm, 256);
  const aesKey = await subtle.importKey('raw', keyBits, { name: 'AES-GCM' }, false, ['encrypt']);

  // AES-256-GCM (12-byte nonce). WebCrypto giver ct||tag konkateneret → split (tag = sidste 16B).
  const nonce = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify(payloadObj));
  const combined = new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aesKey, plaintext));
  const tag = combined.slice(combined.length - 16);
  const ciphertext = combined.slice(0, combined.length - 16);

  return {
    formatVersion: 1,
    formatIdentifier: 'therapy-copilot-encrypted-export',
    createdAt: isoNoFrac(new Date()),
    ephemeralPublicKey: bytesToB64(ephPubRaw),
    encryptedData: bytesToB64(ciphertext),
    nonce: bytesToB64(nonce),
    tag: bytesToB64(tag),
    salt: bytesToB64(salt),
    keyId,
  };
}


// ════════════════════════════════════════════════════════════════════════
//  INSTRUMENT-SKEMAER (kind:'instrument') - WHO-5 + PHQ-9, [MYCEL v1]-emitter
// ════════════════════════════════════════════════════════════════════════
// Standalone token-linkede effektmaal-skemaer (?s=who5 / ?s=phq9) paa det DELTE
// stepper-render-lag (samme et-spoergsmaal-ad-gangen + review + a11y som CAS-1).
// Web-submit emitterer en [MYCEL v1]-konvolut (kontrakt-mycel-v1-2026-06-26.md,
// MJ-ejet; vi emitter MOD den) som MJ's deterministiske, LENIENT parser laeser.
//
// COEKSISTENS: de GAMLE batteri-noegler SKEMAER.who5 / SKEMAER.phq9 (kind:'radio',
// i SKEMA_ORDER, AELDRE oversaettelse) er UROERT - de er laast af selftest + buildPayload.
// Disse standalone-instrumenter lever i et SEPARAT register (INSTRUMENTER) og rammes
// KUN af et SINGLE-token ?s=who5 / ?s=phq9 (routing-prioritet, se index.html). Et
// multi-token batteri (?s=cas,...,who5,...) gaar uaendret til batteri-flowet.
//
// FELT-KONTRAKT: feltnavne fra spec-kat-companion-byg-klar §3 (Viktor-leveret 27/6):
//   WHO-5: who5_item_1..5 (0-5), who5_raw (0-25 AFLEDT), who5_pct (raw x4, AFLEDT)
//   PHQ-9: phq9_item_1..9 (0-3), phq9_sum (0-27 AFLEDT), phq9_item9_flag (bool, item9>0),
//          phq9_funktion (0-3, funktionsspoergsmaal - taeller IKKE i sum, valgfri)
// MJ-kontrakten (§2/§3) definerer endnu IKKE who5/phq9-skabeloner -> additiv
// skabelon-blok skal tilfoejes MJ-side (relaeet, ikke redigeret her; MJ's parser er
// forward-kompat/lenient saa emissionen laeses uanset). Sum-felter ALTID afledt.
//
// FIDELITY: instrument-ordlyd VERBATIM fra spec §7 (WHO-PDF dansk / phqscreeners-dansk).
// PHQ-9 item 6+8 baerer en-dash i den officielle ordlyd = verbatim (instrument-region
// nedenfor undtaget em-dash-reglen). Vores EGEN UI-copy (index.html: knapper, fremskridt,
// Naeste/Forrige, review) er aeoeaa-korrekt + em-dash-fri. Ingen committet default paa
// items (klienten vaelger aktivt, samme princip som CAS-1 belief). PROD-GATE: klinisk
// verbatim-verifikation = Viktor (anbefalet kryds-tjek WHO-5 mod WHO-PDF + PHQ-9 mod
// phqscreeners.com-PDF). Preview-only.

// emdash-guard:instrument-start (WHO-5 © WHO 1998 + PHQ-9 public domain Spitzer/Williams/
// Kroenke: dansk klient-tekst gengivet VERBATIM fra officiel kilde, spec §7.1/§7.2. Em-dash-
// reglen viger KUN for instrument-gengivelsen. Vores egen UI-copy ligger i index.html, em-dash-fri.)

// WHO-5 svarkategorier VERBATIM (spec §7.1): 6 trin, hoej -> lav.
const WHO5_INSTRUMENT_OPTS = [
  { value: 5, label: 'Hele tiden' },
  { value: 4, label: 'Det meste af tiden' },
  { value: 3, label: 'Lidt mere end halvdelen af tiden' },
  { value: 2, label: 'Lidt mindre end halvdelen af tiden' },
  { value: 1, label: 'Lidt af tiden' },
  { value: 0, label: 'På intet tidspunkt' },
];

export const WHO5_INSTRUMENT = {
  id: 'who5', kind: 'instrument', skabelon: 'who5',
  uiTitle: 'Din trivsel', kort: 'WHO-5',
  // Instrument-instruktion VERBATIM (spec §7.1).
  instruktion: 'Sæt venligst ved hvert af de 5 udsagn et kryds i det felt der kommer tættest på hvordan du har følt dig i de seneste to uger. Bemærk at et højere tal står for bedre trivsel.',
  stem: 'I de sidste 2 uger ...',
  attribution: 'WHO-5 Trivselsindeks (1999). © WHO. CC BY-NC-SA 3.0 IGO.',
  // Synligt tal-badge (5..0) paa hver svarknap: instruktionen siger "et hoejere tal
  // staar for bedre trivsel", saa tallet skal vaere synligt for SEENDE klienter (og i
  // svar-knappens tilgaengelige navn for skaermlaeser). Per-instrument-flag, default OFF.
  // KUN WHO-5: PHQ-9 er 0-3 hvor hoejere=vaerre -> et tal ville aktivt vildlede klienten.
  showValueBadge: true,
  options: WHO5_INSTRUMENT_OPTS,
  scoredItems: [
    { key: 'who5_item_1', text: '... har jeg været glad og i godt humør' },
    { key: 'who5_item_2', text: '... har jeg følt mig rolig og afslappet' },
    { key: 'who5_item_3', text: '... har jeg følt mig aktiv og energisk' },
    { key: 'who5_item_4', text: '... er jeg vågnet frisk og udhvilet' },
    { key: 'who5_item_5', text: '... har min dagligdag været fyldt med ting der interesserer mig' },
  ],
  // Licens-/parathedsflag (spec §4): fri brug med kildeangivelse (WHO 1998), verbatim verificeret.
  licensStatus: 'fri-m-kildeangivelse',
  KLAR: true,
};

// PHQ-9 svarkategorier VERBATIM (spec §7.2): 4 trin, 0-3.
const PHQ9_INSTRUMENT_OPTS = [
  { value: 0, label: 'Slet ikke' },
  { value: 1, label: 'Flere dage' },
  { value: 2, label: 'Mere end halvdelen af dagene' },
  { value: 3, label: 'Næsten hver dag' },
];
// Funktionsspoergsmaal-svar VERBATIM (spec §7.2): taeller IKKE i sumscoren.
const PHQ9_FUNKTION_OPTS = [
  { value: 0, label: 'Slet ikke besværligt' },
  { value: 1, label: 'Lidt besværligt' },
  { value: 2, label: 'Meget besværligt' },
  { value: 3, label: 'Ekstremt besværligt' },
];

export const PHQ9_INSTRUMENT = {
  id: 'phq9', kind: 'instrument', skabelon: 'phq9',
  uiTitle: 'Humør og energi', kort: 'PHQ-9',
  stem: 'Inden for de seneste 2 uger, hvor ofte har du været generet af følgende problemer?',
  attribution: 'PHQ-9 (Spitzer, Williams, Kroenke et al.). Public domain. Gengivet med kildeangivelse.',
  options: PHQ9_INSTRUMENT_OPTS,
  scoredItems: [
    { key: 'phq9_item_1', text: 'Lille interesse i eller glæde ved at gøre ting' },
    { key: 'phq9_item_2', text: 'Følt dig nedtrykt, håbløs eller været deprimeret' },
    { key: 'phq9_item_3', text: 'Problemer med at falde i søvn eller sove, eller med at sove for meget' },
    { key: 'phq9_item_4', text: 'Følt dig træt eller har kun haft lidt energi' },
    { key: 'phq9_item_5', text: 'Ringe appetit eller spist for meget' },
    { key: 'phq9_item_6', text: 'Haft det dårligt med dig selv – eller følt, at du er en fiasko eller har skuffet dig selv eller din familie' },
    { key: 'phq9_item_7', text: 'Problemer med at koncentrere dig om ting, såsom at læse avisen eller se TV' },
    { key: 'phq9_item_8', text: 'Har bevæget dig eller talt så langsomt, at andre kunne have bemærket det? Eller det modsatte – været så rastløs eller hvileløs, at du har bevæget dig mere omkring end sædvanligt' },
    { key: 'phq9_item_9', text: 'Tanker om, at det ville være bedre, hvis du var død eller om at gøre skade på dig selv på en eller anden måde' },
  ],
  // Item 9 (selvmordstanker) > 0 -> safety-lag prominent + phq9_item9_flag til behandler.
  safetyKey: 'phq9_item_9',
  funktion: {
    key: 'phq9_funktion', optional: true,
    text: 'Hvis du har afkrydset mindst ét af de ovenstående problemer, hvor besværligt har disse problemer gjort det for dig at arbejde, klare tingene i hjemmet eller komme overens med andre?',
    options: PHQ9_FUNKTION_OPTS,
  },
  // Licens-/parathedsflag (spec §4): public domain (Pfizer 2010), verbatim verificeret.
  licensStatus: 'public-domain',
  KLAR: true,
};
// emdash-guard:instrument-end

// Kanonisk [MYCEL]-feltorden pr. skabelon (spec §3). Bruges af emitter + guard.
export function instrumentFeltOrden(skema) {
  const items = skema.scoredItems.map((it) => it.key);
  if (skema.skabelon === 'who5') return [...items, 'who5_raw', 'who5_pct'];
  if (skema.skabelon === 'phq9') return [...items, 'phq9_sum', 'phq9_item9_flag', skema.funktion.key];
  if (skema.skabelon === 'gad7') return [...items, 'gad7_sum'];   // INGEN funktion/flag (modsat PHQ-9)
  return items;
}

// Heltal-svar (0..max) fra answers, ellers null. ALDRIG gaet/default.
function instrumentInt(answers, key) {
  const raw = answers ? answers[key] : undefined;
  if (raw == null || raw === '') return null;
  const n = Number(raw);
  return Number.isInteger(n) ? n : null;
}

// Afledte felter (ALTID beregnet, aldrig hardcodet). Manglende item -> afledt = null
// (emitteres tomt = "ikke registreret"; ingen vildledende delsum).
export function instrumentDerived(skema, answers) {
  const ints = {};
  for (const it of skema.scoredItems) ints[it.key] = instrumentInt(answers, it.key);
  const allePresent = skema.scoredItems.every((it) => ints[it.key] != null);
  const sum = allePresent ? skema.scoredItems.reduce((s, it) => s + ints[it.key], 0) : null;
  if (skema.skabelon === 'who5') {
    return { who5_raw: sum, who5_pct: (sum == null) ? null : sum * 4 };
  }
  if (skema.skabelon === 'phq9') {
    const i9 = ints[skema.safetyKey];
    return { phq9_sum: sum, phq9_item9_flag: (i9 == null) ? null : (i9 > 0) };
  }
  if (skema.skabelon === 'gad7') {
    return { gad7_sum: sum };   // sum af alle 7 (0-21); ingen flag/funktion
  }
  return {};
}

// [MYCEL v1]-emitter for WHO-5 / PHQ-9 (kontrakt §1-konvolut + spec §3-felter). Ren tekst
// = MJ-parser-maal. Heltal eller tom streng pr. felt (tom = "ikke registreret"); afledte
// sum/pct/flag beregnes her (aldrig hardcodet). dato + ref leveres af kalderen (token-linket),
// ALDRIG today(). kilde: 'web' (fuld web-submit) | 'sms-fallback' (bevidst lossy).
export function buildInstrumentMycel(skema, answers = {}, meta = {}) {
  const ref   = (meta.ref   != null) ? String(meta.ref).trim()   : '';
  const dato  = (meta.dato  != null) ? String(meta.dato).trim()  : '';
  const kilde = (meta.kilde != null) ? String(meta.kilde).trim() : 'web';
  const derived = instrumentDerived(skema, answers);
  const linjer = [
    '[MYCEL v1]',
    'skabelon: ' + skema.skabelon,
    'klient_ref: ' + ref,
    'dato: ' + dato,
    'kilde: ' + kilde,
  ];
  for (const key of instrumentFeltOrden(skema)) {
    let ud = '';
    if (key === 'phq9_item9_flag') {
      ud = (derived.phq9_item9_flag == null) ? '' : (derived.phq9_item9_flag ? 'true' : 'false');
    } else if (Object.prototype.hasOwnProperty.call(derived, key)) {
      ud = (derived[key] == null) ? '' : String(derived[key]);
    } else {
      const v = instrumentInt(answers, key);     // item- eller funktion-felt
      ud = (v == null) ? '' : String(v);
    }
    linjer.push(key + ': ' + ud);
  }
  linjer.push('[/MYCEL]');
  return linjer.join('\n');
}

// ── GAD-7 (Generaliseret Angst, 7 items) — KLAR 2026-06-27 ───────────────────
// Verbatim modtaget fra officiel dansk phqscreeners-PDF (GAD7_Danish for Denmark.pdf);
// spec/kilde: Projekt_Praksis/noter/kat-instrument-gad7-hentning-wsas-beslutning-2026-06-27.md §1.
// Fri licens (Pfizer education grant, ingen tilladelse kraevet). INGEN funktionslinje (denne
// officielle danske version har INTET funktions-item, modsat PHQ-9 item 10) + INGEN safety-panel
// (GAD-7 har ingen suicidalitets-item, modsat PHQ-9 item 9). gad7_sum = sum af alle 7 (0-21);
// svaerhedsbaand er KLINIKER-side (ikke patient-vist). Ingen tal-badge (0-3, hoejere = vaerre).
// Marker-klausulen "et kryds" gengives som ORD, ikke "✔"-glyf: ikon/emoji-direktivet er
// UPAAVIRKET af verbatim-undtagelsen (instrumenter maa ikke baere emoji), Viktor-valg 27/6
// (konsistent med WHO-5's "et kryds i det felt"). Em-dash-reglen rorer ikke verbatim (sentinel).
// emdash-guard:instrument-start (GAD-7 public domain Spitzer/Williams/Kroenke et al.: verbatim
// gengivelse fra officiel dansk phqscreeners-PDF; em-dash-reglen gaelder IKKE inden for dette region)
export const GAD7_INSTRUMENT = {
  id: 'gad7', kind: 'instrument', skabelon: 'gad7',
  uiTitle: 'Bekymring og uro', kort: 'GAD-7',
  // Verbatim instruktion (glyf "✔" -> ord "et kryds" pr. ikon/emoji-direktiv, Viktor-valg 27/6).
  instruktion: 'Hvor ofte i de sidste 14 dage har du været generet af følgende problemer? (Marker dit svar med et kryds)',
  // Stamme echoes pr. item i ét-spørgsmål-ad-gangen-flowet (samme mønster som PHQ-9); marker-
  // klausulen gentages ikke (engangs-vejledning lever i instruktionen ovenfor).
  stem: 'Hvor ofte i de sidste 14 dage har du været generet af følgende problemer?',
  attribution: 'Spitzer, Williams, Kroenke et al., med uddannelseslegat fra Pfizer Inc.',
  options: [                                  // svarkategorier 0-3 VERBATIM (matcher PHQ-9 Danish)
    { value: 0, label: 'Slet ikke' },
    { value: 1, label: 'Flere dage' },
    { value: 2, label: 'Mere end halvdelen af dagene' },
    { value: 3, label: 'Næsten hver dag' },
  ],
  scoredItems: [                              // 7 items VERBATIM (officiel dansk PDF)
    { key: 'gad7_item_1', text: 'Følt dig nervøs, ængstelig eller anspændt' },
    { key: 'gad7_item_2', text: 'Ikke kunnet holde op med at bekymre dig eller ikke kunnet styre din bekymring' },
    { key: 'gad7_item_3', text: 'Bekymret dig for meget om alt muligt' },
    { key: 'gad7_item_4', text: 'Haft svært ved at slappe af' },
    { key: 'gad7_item_5', text: 'Været så rastløs, at du har haft svært ved at sidde stille' },
    { key: 'gad7_item_6', text: 'Haft let ved at blive sur eller irritabel' },
    { key: 'gad7_item_7', text: 'Været bange, som om noget frygteligt kunne ske' },
  ],
  // INGEN funktion, INGEN safetyKey (begge bevidst udeladt for GAD-7).
  // Licens-/parathedsflag (spec §4): public domain (Pfizer 2010), verbatim verificeret 27/6.
  licensStatus: 'public-domain',
  KLAR: true,
};
// emdash-guard:instrument-end

// ════════════════════════════════════════════════════════════════════════
//  SCAFFOLD-SLOTS (KLAR:false) — defineret, men IKKE eksponerbare (spec §4)
// ════════════════════════════════════════════════════════════════════════
// Et instrument-modul kan defineres FØR dets licens + verbatim er på plads. Slottet
// registrerer KUN mønsteret + licensStatus; item-teksten forbliver TOM (scoredItems: [])
// indtil den verbatim kilde lander. Reglen: ALDRIG gættede/fabrikerede items i et klinisk
// skema. KLAR:false → slottet når ALDRIG ind i INSTRUMENTER (gated loop nedenfor) → et
// single-token ?s=<skabelon> rammer det ikke → uekssponerbar i preview og prod. Når licens
// + verbatim lander: indsæt verbatim items (sentinel-omkranset) + flip KLAR:true. Nul
// genbygning, nul fabrikation. Dette generaliserer Viktors "klar til at tage dem ind senere".

// CAS-1 — licens-gated (MCT-Institute, kommerciel app-indlejring = Viktor-beslutning).
// Venter på: licens-svar + Viktor 3-linse af nyt CAS-1-arbejde (eget spor, ikke denne branch).
export const CAS1_INSTRUMENT_SLOT = {
  id: 'cas1', kind: 'instrument', skabelon: 'cas1',
  uiTitle: '', kort: 'CAS-1',
  instruktion: '', stem: '', attribution: '',
  options: [], scoredItems: [],          // 0 item-tekst — verbatim afventer licens
  licensStatus: 'licens-gated',
  KLAR: false,
};

// WSAS — afventer e-kommerciel licens (ePROVIDE) + dansk verbatim.
export const WSAS_INSTRUMENT_SLOT = {
  id: 'wsas', kind: 'instrument', skabelon: 'wsas',
  uiTitle: '', kort: 'WSAS',
  instruktion: '', stem: '', attribution: '',
  options: [], scoredItems: [],          // 0 item-tekst — verbatim afventer licens
  licensStatus: 'afventer',
  KLAR: false,
};

// WHODAS 2.0 — afventer WHO portal-licens + dansk verbatim.
export const WHODAS_INSTRUMENT_SLOT = {
  id: 'whodas', kind: 'instrument', skabelon: 'whodas',
  uiTitle: '', kort: 'WHODAS 2.0',
  instruktion: '', stem: '', attribution: '',
  options: [], scoredItems: [],          // 0 item-tekst — verbatim afventer licens
  licensStatus: 'afventer',
  KLAR: false,
};

// ════════════════════════════════════════════════════════════════════════
//  MASKINEL LICENS-GATE (spec §4 KLAR-reglen + §5 extensibilitets-beskyttelse)
// ════════════════════════════════════════════════════════════════════════
// Alle instrument-moduler (aktive + scaffold-slots) i ÉN liste. Registrering i INSTRUMENTER
// er GATED på KLAR: kun KLAR:true når ind → kun de kan rammes af et single-token ?s=<skabelon>
// (routing slår op i INSTRUMENTER, se index.html). Et licens-pending (KLAR:false) instrument
// kan derfor ALDRIG lække til preview/prod, uanset hvad et token siger. Dette generaliserer
// det tidligere GAD7_INSTRUMENT_KLAR-mønster til ALLE instrumenter. Guard: test/instrument-
// klar-gate.mjs asserterer at intet KLAR:false-modul er i INSTRUMENTER eller routing.
export const INSTRUMENT_MODULER = [
  WHO5_INSTRUMENT, PHQ9_INSTRUMENT, GAD7_INSTRUMENT,                  // KLAR:true  (aktiv)
  CAS1_INSTRUMENT_SLOT, WSAS_INSTRUMENT_SLOT, WHODAS_INSTRUMENT_SLOT, // KLAR:false (scaffold)
];

// SEPARAT register (IKKE SKEMAER - undgaar kollision med batteri-noeglerne who5/phq9).
export const INSTRUMENTER = {};
for (const modul of INSTRUMENT_MODULER) {
  if (modul.KLAR) INSTRUMENTER[modul.skabelon] = modul;   // maskinel licens-gate
}
