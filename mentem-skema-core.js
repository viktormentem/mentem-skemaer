// mentem-skema-core.js — MCT-skema-kadence kerne (P1a)
//
// Miljø-agnostisk ES-modul: kører identisk i browser (<script type="module">)
// OG i Node 18+ (round-trip-harness + selftest). Ren WebCrypto — INGEN
// tredjeparts-krypto-lib, INGEN privat/prod-nøgle (KRYPTO-GUARD: static-site
// har KUN modtagerens PUBLIC X25519-nøgle og KRYPTERER; kun Mentem dekrypterer).
//
// Krypto-kontrakt (SKAL matche Mentems E2EKryptering.swift PRÆCIST):
//   Curve25519 (X25519) ECDH → HKDF-SHA256(salt, info="TherapyCopilot-E2E-Export-v1", 32B)
//   → AES-256-GCM. Container = KrypteretEksportContainer (ciphertext + tag SEPARAT,
//   ISO8601-datoer UDEN fraktioner — CryptoKit .iso8601 afviser millisekunder).
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
    id: 'cas', kind: 'vas', title: 'Ugens mønstre', short: 'Proces',
    icon: '🧭', badge: '4 skalaer',
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
    id: 'mcb', kind: 'vas', title: 'Tanker om bekymring', short: 'Antagelser',
    icon: '💭', badge: '5 skalaer',
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
  gad7: {
    id: 'gad7', kind: 'radio', title: 'GAD-7', short: 'Angst', icon: '😰', badge: '7 spørgsmål',
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
    id: 'phq9', kind: 'radio', title: 'PHQ-9', short: 'Stemningsleje', icon: '😔', badge: '9 spørgsmål',
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
    id: 'who5', kind: 'radio', title: 'WHO-5', short: 'Trivsel', icon: '🌤️', badge: '5 spørgsmål',
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
    id: 'wsas', kind: 'radio', title: 'WSAS', short: 'Funktion', icon: '🧩', badge: '5 spørgsmål',
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
  // ── Alliance (frit/public domain, alliance-checkpoints) ────────────────
  waisr: {
    id: 'waisr', kind: 'radio', title: 'WAI-SR', short: 'Samarbejde', icon: '🤝', badge: '12 spørgsmål',
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
//  SCORING (intern — bruges til opaque payload; klienten ser ALDRIG resultatet)
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
//  PAYLOAD (TerapiEksportPayload-shape — matcher E2EKryptering.swift)
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
  return payload;
}

// ════════════════════════════════════════════════════════════════════════
//  KRYPTO — public-key-only opaque output (R3)
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

/// Krypter et payload-objekt mod modtagerens X25519-public-key (base64 / base64url).
/// Returnerer et KrypteretEksportContainer-objekt (klar til JSON.stringify).
export async function mentemEncrypt(recipientPubB64, payloadObj) {
  const subtle = globalThis.crypto.subtle;
  const recipientPub = await subtle.importKey('raw', b64ToBytes(recipientPubB64), { name: 'X25519' }, false, []);

  // Sender-ephemeral keypair (fresh pr. kryptering → forward secrecy).
  const eph = await subtle.generateKey({ name: 'X25519' }, true, ['deriveBits']);
  const ephPubRaw = await subtle.exportKey('raw', eph.publicKey);

  // ECDH → rå 32-byte shared secret (matcher CryptoKit sharedSecretFromKeyAgreement).
  const shared = new Uint8Array(await subtle.deriveBits({ name: 'X25519', public: recipientPub }, eph.privateKey, 256));

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
  };
}
