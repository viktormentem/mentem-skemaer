// selftest.mjs — Node TDD self-test for mentem-skema-core.js
//
// Verificerer (RED→GREEN, P1a):
//  1. computeScores: kendte svar → kendte scores (PHQ-9/GAD-7/WHO-5/WSAS/WAI-SR).
//  2. buildPayload: korrekt TerapiEksportPayload-shape + ISO8601 UDEN fraktioner
//     (CryptoKit .iso8601 afviser millisekunder — round-trip-fælde).
//  3. mentemEncrypt: JS-intern krypto-round-trip (encrypt→decrypt i Node) +
//     container-shape matcher KrypteretEksportContainer.
//
// Authoritativ CryptoKit-kompat bevises separat af Swift StaticSiteCryptoRoundTripTests.
//
// Kør: node test/selftest.mjs   (exit 0 = alle grønne)

import {
  computeScores,
  buildPayload,
  buildPayloadCSD,
  buildPayloadBaseline,
  mergeDiaryEntries,
  mentemEncrypt,
  SKEMA_ORDER,
  SKEMAER,
  CSD_SOEVNDAGBOG,
  SOEVN_BASELINE,
  PINNED_PUBKEY,
  PINNED_KEY_ID,
  resolveRecipientKey,
  buildAnmodKonvolut,
  ANMOD_SCHEMA_TYPE,
  ANMOD_CONSENT_WORDING,
  ANMOD_CONSENT_WORDING_VERSION,
  ANMOD_ART9_DENY,
  ANMOD_DISPLAY,
  ANMOD_GRUNDLAG,
  ANMOD_HENVISNING_PSYKIATER,
  ANMOD_FORLOEB_TILBUDT,
  ANMOD_TID_DAGE,
  ANMOD_TID_TIDER,
  SENDT_KVITTERING_PRIMAER,
  SENDT_KVITTERING_VERSION,
  sendtKvitteringSekundaer,
  SEND_SIKKERT_CTA,
} from '../mentem-skema-core.js';
import { scanText, runGuard, scanEmDash, runEmDashGuard, GUARDED_FILES, EMDASH_GUARDED_FILES } from './emoji-guard.mjs';
import { scanCopy, runCopyGuard, triageCopy, COPY_GUARDED_FILES } from './copy-guard.mjs';
import { readFileSync } from 'node:fs';

// Live v2-privatlivspolitik (samme URL som anmod.html bruger — én adresse på hele fladen).
const PRIVATLIV_URL = 'https://psykologviktornielsen.dk/privatlivspolitik.html';

let failures = 0;
function check(name, cond, detail = '') {
  if (cond) { console.log(`  ✓ ${name}`); }
  else { console.error(`  ✗ ${name} ${detail}`); failures++; }
}
function eq(name, got, want) {
  check(name, JSON.stringify(got) === JSON.stringify(want), `(got ${JSON.stringify(got)}, want ${JSON.stringify(want)})`);
}

// ── Test-svar (heltal pr. item) ──────────────────────────────────────────
const answers = {
  phq9:  { 0:2,1:2,2:2,3:2,4:2,5:2,6:2,7:2,8:2 },   // sum 18
  gad7:  { 0:1,1:1,2:1,3:1,4:1,5:1,6:1 },           // sum 7
  who5:  { 0:5,1:4,2:3,3:2,4:1 },                   // raw 15 → pct 60
  wsas:  { 0:8,1:8,2:8,3:8,4:8 },                   // sum 40
  waisr: { 0:5,1:5,2:5,3:5,4:5,5:5,6:5,7:5,8:5,9:5,10:5,11:5 }, // sum 60
  cas:   { 0:80,1:70,2:60,3:50 },                   // avg 65
  mcb:   { 0:90,1:85,2:40,3:75,4:60 },
};

console.log('computeScores:');
const s = computeScores(answers);
eq('phq9 total',  s.phq9.total, 18);
eq('gad7 total',  s.gad7.total, 7);
eq('who5 raw',    s.who5.total, 15);
eq('who5 pct',    s.who5.percent, 60);
eq('wsas total',  s.wsas.total, 40);
eq('waisr total', s.waisr.total, 60);
eq('cas avg',     s.cas.total, 65);
eq('cas worry',   s.cas.components.worry, 80);

console.log('buildPayload (envelope-wrap):');
const batteriEnv = buildPayload(answers, { name: 'Test Klient', sessionNumber: 4 });
// Konvolut-form (transport): {schemaVersion, schemaType, clientTimestamp, data, clientUA}.
check('konvolut schemaType non-tom (=> .konvolutDirekte)', typeof batteriEnv.schemaType === 'string' && batteriEnv.schemaType.length > 0);
check('konvolut schemaType = categories[0]', batteriEnv.schemaType === batteriEnv.data.categories[0]);
check('konvolut schemaVersion = data.version (Int)', batteriEnv.schemaVersion === batteriEnv.data.version);
check('konvolut clientTimestamp = exportedAt', batteriEnv.clientTimestamp === batteriEnv.data.exportedAt);
check('konvolut clientUA = web', batteriEnv.clientUA === 'web');
check('konvolut bærer INGEN respondentPseudonym web-side', batteriEnv.respondentPseudonym === undefined);
// Flad payload bevaret UÆNDRET i `data` (0 tab) — eksisterende invariant-checks uændrede.
const payload = batteriEnv.data;
check('version 1', payload.version === 1);
check('therapistName', payload.therapistName === 'Viktor Nielsen');
check('clientName', payload.clientName === 'Test Klient');

const ISO_NOFRAC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
check('exportedAt ISO uden fraktion', ISO_NOFRAC.test(payload.exportedAt), `(${payload.exportedAt})`);

const qs = payload.questionnaireScores;
check('5 questionnaireScores', qs.length === 5, `(${qs.length})`);
check('alle qs completedAt no-frac', qs.every(q => ISO_NOFRAC.test(q.completedAt)));
check('weekNumber = sessionNumber', qs.every(q => q.weekNumber === 4));
const phq = qs.find(q => q.type === 'phq9');
eq('phq9 payload totalScore', phq.totalScore, 18);

check('casTrends 1 entry', payload.casTrends.length === 1);
eq('casTrends components', payload.casTrends[0].componentScores, { worry:80, rumination:70, threat:60, avoidance:50 });
check('casTrends date no-frac', ISO_NOFRAC.test(payload.casTrends[0].date));

check('beliefRatings 5', payload.beliefRatings.length === 5);
check('beliefRatings ratings 0-100 int', payload.beliefRatings.every(b => Number.isInteger(b.rating) && b.rating >= 0 && b.rating <= 100));
check('beliefRatings date no-frac', payload.beliefRatings.every(b => ISO_NOFRAC.test(b.date)));

eq('SKEMA_ORDER', SKEMA_ORDER, ['cas','mcb','gad7','phq9','who5','wsas','waisr']);

// ── Krypto JS-intern round-trip (WebCrypto X25519 + HKDF + AES-GCM) ───────
console.log('mentemEncrypt (JS-intern round-trip):');
const recipient = await crypto.subtle.generateKey({ name: 'X25519' }, true, ['deriveBits']);
const recipientPubRaw = new Uint8Array(await crypto.subtle.exportKey('raw', recipient.publicKey));
const recipientPubB64 = Buffer.from(recipientPubRaw).toString('base64');

const container = await mentemEncrypt(recipientPubB64, batteriEnv);   // transporteres som konvolut
check('formatIdentifier', container.formatIdentifier === 'therapy-copilot-encrypted-export');
check('formatVersion 1', container.formatVersion === 1);
check('createdAt no-frac', ISO_NOFRAC.test(container.createdAt), `(${container.createdAt})`);
check('har ephemeralPublicKey', !!container.ephemeralPublicKey);
check('har encryptedData', !!container.encryptedData);
check('har nonce', !!container.nonce);
check('har tag', !!container.tag);
check('har salt', !!container.salt);

// Decrypt i Node (replikerer E2EKryptering.dekrypterContainer's trin)
async function nodeDecrypt(c, recipientPrivKey) {
  const b64 = (x) => Uint8Array.from(Buffer.from(x, 'base64'));
  const ephPub = await crypto.subtle.importKey('raw', b64(c.ephemeralPublicKey), { name: 'X25519' }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'X25519', public: ephPub }, recipientPrivKey, 256));
  const ikm = await crypto.subtle.importKey('raw', shared, 'HKDF', false, ['deriveBits']);
  const keyBits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: b64(c.salt), info: new TextEncoder().encode('TherapyCopilot-E2E-Export-v1') },
    ikm, 256);
  const aesKey = await crypto.subtle.importKey('raw', keyBits, { name: 'AES-GCM' }, false, ['decrypt']);
  // CryptoKit gemmer ciphertext + tag separat; WebCrypto forventer dem konkateneret
  const ct = b64(c.encryptedData), tag = b64(c.tag);
  const combined = new Uint8Array(ct.length + tag.length);
  combined.set(ct); combined.set(tag, ct.length);
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64(c.nonce) }, aesKey, combined);
  return JSON.parse(new TextDecoder().decode(pt));
}
const roundtripped = await nodeDecrypt(container, recipient.privateKey);
check('round-trip konvolut schemaType', roundtripped.schemaType === batteriEnv.schemaType);
check('round-trip konvolut clientUA = web', roundtripped.clientUA === 'web');
check('round-trip data.clientName', roundtripped.data.clientName === payload.clientName);
check('round-trip data.questionnaireScores bevaret', roundtripped.data.questionnaireScores.length === 5);
check('round-trip data.casTrends bevaret', roundtripped.data.casTrends[0].componentScores.worry === 80);

// ── Key-pinning hærdning ──────────────────────────────────────────────────
console.log('key-pinning:');
check('PINNED_PUBKEY sat (base64url, 32B)', typeof PINNED_PUBKEY === 'string' && PINNED_PUBKEY.length >= 43);
check('PINNED_KEY_ID = 8 hex', /^[0-9a-f]{8}$/.test(PINNED_KEY_ID));
check('container stempler keyId', container.keyId === PINNED_KEY_ID);
check('resolve: intet ?pk → pinned', resolveRecipientKey(null).ok && resolveRecipientKey(null).key === PINNED_PUBKEY);
check('resolve: matchende ?pk → ok', resolveRecipientKey(PINNED_PUBKEY).ok === true);
const stdVariant = PINNED_PUBKEY.replace(/-/g, '+').replace(/_/g, '/') + '=';  // base64 m. padding
check('resolve: base64-variant af samme nøgle → ok', resolveRecipientKey(stdVariant).ok === true);
const foreign = resolveRecipientKey('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA');
check('resolve: fremmed ?pk → AFVIST (krypter aldrig til fremmed nøgle)', foreign.ok === false && foreign.reason === 'mismatch');

// ── Søvndagbog (CSD) — indholds-modul + payload-gren ──────────────────────
console.log('soevndagbog (CSD):');
check('SKEMAER.soevndagbog findes', !!SKEMAER.soevndagbog);
check('soevndagbog kind=diary', SKEMAER.soevndagbog.kind === 'diary');
check('soevndagbog IKKE i SKEMA_ORDER (standalone)', !SKEMA_ORDER.includes('soevndagbog'));
check('CSD_SOEVNDAGBOG === SKEMAER.soevndagbog (drop-in-handle)', CSD_SOEVNDAGBOG === SKEMAER.soevndagbog);
check('CSD har Carney-attribution', /Carney/.test(SKEMAER.soevndagbog.attribution || ''));
const diaryKeys = CSD_SOEVNDAGBOG.fields.map(f => f.key);
for (const k of ['bedtime','lightsOut','sleepLatencyMin','awakeningsCount','awakeningsMin','finalAwake','outOfBed','quality','naps','substans']) {
  check(`CSD-felt: ${k}`, diaryKeys.includes(k));
}
// INVARIANT (spec-ux-soevndagbog-udfyldning §1): intet CSD-felt må bære en committed
// `default` — en fantom-default registreres som falsk svar og forurener kliniske data.
check('CSD: ingen felter med committed default (fantom-guard)',
  CSD_SOEVNDAGBOG.fields.every(f => f.default == null));
// M1.6/M1.3 additive SRT-safety-felter (srtOnly => baseline-render urørt).
for (const k of ['daytimeSleepiness_0_10','incidentFlag','incidentNote']) {
  check(`CSD-felt (M1.3-kontrakt): ${k}`, diaryKeys.includes(k));
}
check('M1.6: F1 er nrs 0-10 m. weekOneDaily + srtOnly', (() => {
  const f1 = CSD_SOEVNDAGBOG.fields.find(f => f.key === 'daytimeSleepiness_0_10');
  return f1.kind === 'nrs' && f1.srtOnly === true && f1.weekOneDaily === true && f1.min === 0 && f1.max === 10;
})());
check('M1.6: F2 incidentFlag er safety + srtOnly', (() => {
  const f2 = CSD_SOEVNDAGBOG.fields.find(f => f.key === 'incidentFlag');
  return f2.kind === 'safety' && f2.srtOnly === true;
})());
check('M1.6: incidentNote er valgfri safetyNote', (() => {
  const n = CSD_SOEVNDAGBOG.fields.find(f => f.key === 'incidentNote');
  return n.kind === 'safetyNote' && n.optional === true && n.srtOnly === true;
})());
// SOL + WASO er VARIGHEDER → number (minutter), ALDRIG ur/tids-vælger (§2-Fælde-B).
check('CSD: SOL = number m. enhed minutter (ikke ur)',
  CSD_SOEVNDAGBOG.fields.find(f => f.key === 'sleepLatencyMin').kind === 'number' &&
  CSD_SOEVNDAGBOG.fields.find(f => f.key === 'sleepLatencyMin').unit === 'minutter');
check('CSD: WASO = number m. enhed minutter (ikke ur)',
  CSD_SOEVNDAGBOG.fields.find(f => f.key === 'awakeningsMin').kind === 'number' &&
  CSD_SOEVNDAGBOG.fields.find(f => f.key === 'awakeningsMin').unit === 'minutter');

console.log('buildPayloadCSD:');
const csdEntries = [
  { date:'2026-06-01', bedtime:'23:15', lightsOut:'23:30', sleepLatencyMin:25, awakeningsCount:2, awakeningsMin:30, finalAwake:'06:45', outOfBed:'07:00', quality:3, naps:'', substans:{ intet:true },
    daytimeSleepiness_0_10:0, incidentFlag:false },
  { date:'2026-06-02', bedtime:'23:00', lightsOut:'23:20', sleepLatencyMin:15, awakeningsCount:1, awakeningsMin:10, finalAwake:'06:30', outOfBed:'06:50', quality:4, naps:'20 min ved middag', substans:{ intet:false, alkohol:[{ antalGenstande:1, tidspunkt:'Nat' }], natFlag:true },
    daytimeSleepiness_0_10:9, incidentFlag:true, incidentNote:'Var ved at falde i søvn bag rattet.' },
];
const csdEnv = buildPayloadCSD(csdEntries, { name:'Søvn Klient', startedAt:'2026-06-01', plannedDays:14 });
check('csd konvolut schemaType = soevndagbog', csdEnv.schemaType === 'soevndagbog');
check('csd konvolut schemaVersion = meta.schemaVersion', csdEnv.schemaVersion === csdEnv.data.meta.schemaVersion);
check('csd konvolut clientTimestamp = exportedAt', csdEnv.clientTimestamp === csdEnv.data.exportedAt);
check('csd konvolut clientUA = web', csdEnv.clientUA === 'web');
const csd = csdEnv.data;
check('csd version 1', csd.version === 1);
check('csd therapistName', csd.therapistName === 'Viktor Nielsen');
check('csd clientName', csd.clientName === 'Søvn Klient');
check('csd categories = [soevndagbog]', JSON.stringify(csd.categories) === JSON.stringify(['soevndagbog']));
check('csd diaryType', csd.diaryType === 'consensus-sleep-diary');
check('csd plannedDays', csd.plannedDays === 14);
check('csd exportedAt no-frac', ISO_NOFRAC.test(csd.exportedAt), `(${csd.exportedAt})`);
check('csd sleepDiary 2 entries', csd.sleepDiary.length === 2);
check('csd entry bevarer felter', csd.sleepDiary[0].bedtime === '23:15' && csd.sleepDiary[0].sleepLatencyMin === 25);
check('csd dropper tomme valgfri felter', csd.sleepDiary[0].naps === undefined);
check('csd beholder udfyldte valgfri felter', csd.sleepDiary[1].naps === '20 min ved middag');
check('csd substans intet bevaret', csd.sleepDiary[0].substans && csd.sleepDiary[0].substans.intet === true);
check('csd substans struktureret bevaret', csd.sleepDiary[1].substans.alkohol[0].antalGenstande === 1 && csd.sleepDiary[1].substans.alkohol[0].tidspunkt === 'Nat');
check('csd substans natFlag bevaret', csd.sleepDiary[1].substans.natFlag === true);
check('csd INGEN scoring (nul-score)', csd.questionnaireScores === undefined && csd.sleepDiary[0].tst === undefined && csd.sleepDiary[0].se === undefined);
// M1.3-kontrakt passthrough: 0 og false OVERLEVER drop-tom-reglen; null/udeladt droppes.
check('M1.3: daytimeSleepiness 0 overlever (ikke droppet som tom)', csd.sleepDiary[0].daytimeSleepiness_0_10 === 0);
check('M1.3: incidentFlag false overlever', csd.sleepDiary[0].incidentFlag === false);
check('M1.3: daytimeSleepiness 9 + incidentFlag true bevaret', csd.sleepDiary[1].daytimeSleepiness_0_10 === 9 && csd.sleepDiary[1].incidentFlag === true);
check('M1.3: incidentNote bevaret ved Ja', /bag rattet/.test(csd.sleepDiary[1].incidentNote || ''));
check('M1.3: udeladt F1 droppes (null-adfærd)', csd.sleepDiary[0].incidentNote === undefined);

// Round-trip: CSD-KONVOLUT krypteres + dekrypteres → data.sleepDiary intakt.
const csdContainer = await mentemEncrypt(recipientPubB64, csdEnv);
const csdRT = await nodeDecrypt(csdContainer, recipient.privateKey);
check('csd round-trip konvolut schemaType', csdRT.schemaType === 'soevndagbog');
check('csd round-trip data.sleepDiary bevaret', csdRT.data.sleepDiary.length === 2 && csdRT.data.sleepDiary[1].quality === 4);
check('csd round-trip data.diaryType bevaret', csdRT.data.diaryType === 'consensus-sleep-diary');

// Versions-blok (§6) + forloebId — flad payload UÆNDRET under `data`.
console.log('csd versions-blok (draft-store):');
const csdV = buildPayloadCSD(csdEntries, { startedAt: '2026-06-01', plannedDays: 14, forloebId: 'a1b2c3d4e5f60718293a4b5c6d7e8f90' }).data;
check('meta.instrument = CSD-Carney-2012', csdV.meta.instrument === 'CSD-Carney-2012');
check('meta.schemaVersion', csdV.meta.schemaVersion === 1);
check('meta.contentVersion', csdV.meta.contentVersion === 1);
check('meta.protocolVersion', csdV.meta.protocolVersion === 1);
check('meta.siteBuild stamp', typeof csdV.meta.siteBuild === 'string' && csdV.meta.siteBuild.length > 0);
check('meta.forloebId = token', csdV.meta.forloebId === 'a1b2c3d4e5f60718293a4b5c6d7e8f90');
check('meta.periodPlanned/Completed', csdV.meta.periodPlanned === 14 && csdV.meta.periodCompleted === 2);
check('meta additivt på formatVersion 1', csdV.version === 1);

// Draft-merge: newest-wins pr. dato, server-authoritative ved tie.
console.log('mergeDiaryEntries:');
const local = [
  { date: '2026-06-01', quality: 5, savedAt: '2026-06-02T08:00:00Z' },   // lokal nyere
  { date: '2026-06-03', quality: 2, savedAt: '2026-06-03T08:00:00Z' },   // kun lokal
];
const server = [
  { date: '2026-06-01', quality: 3, savedAt: '2026-06-01T08:00:00Z' },   // ældre end lokal
  { date: '2026-06-02', quality: 4, savedAt: '2026-06-02T08:00:00Z' },   // kun server
];
const merged = mergeDiaryEntries(local, server);
check('merge: union af datoer (3)', merged.length === 3);
check('merge: sorteret pr. dato', merged.map(e => e.date).join(',') === '2026-06-01,2026-06-02,2026-06-03');
check('merge: lokal nyere vinder (01 → quality 5)', merged.find(e => e.date === '2026-06-01').quality === 5);
check('merge: server-only bevaret (02)', merged.find(e => e.date === '2026-06-02').quality === 4);
check('merge: lokal-only bevaret (03)', merged.find(e => e.date === '2026-06-03').quality === 2);
const tie = mergeDiaryEntries(
  [{ date: '2026-06-01', quality: 9, savedAt: '2026-06-01T08:00:00Z' }],
  [{ date: '2026-06-01', quality: 1, savedAt: '2026-06-01T08:00:00Z' }]);
check('merge: tie → server-authoritative', tie[0].quality === 1);

// ── Søvn-baseline (engangs intake) ────────────────────────────────────────
console.log('soevn-baseline:');
check('SKEMAER soevn-baseline findes', !!SKEMAER['soevn-baseline']);
check('baseline kind=baseline', SKEMAER['soevn-baseline'].kind === 'baseline');
check('baseline IKKE i SKEMA_ORDER', !SKEMA_ORDER.includes('soevn-baseline'));
check('SOEVN_BASELINE === SKEMAER[soevn-baseline]', SOEVN_BASELINE === SKEMAER['soevn-baseline']);
const blKeys = SOEVN_BASELINE.fields.map(f => f.key);
for (const k of ['alder','koen','undertype','varighed','substans','lure','vanligOpvaagning']) {
  check(`baseline-felt: ${k}`, blKeys.includes(k));
}
check('baseline INGEN alder i daglig CSD', !CSD_SOEVNDAGBOG.fields.some(f => f.key === 'alder'));

console.log('buildPayloadBaseline:');
const blAnswers = {
  alder: 67, koen: 'Kvinde', undertype: 'Vågner for tidligt om morgenen',
  varighed: '3 måneder eller mere',
  substans: { intet: false, koffein: [{ antalEnheder: 2, tidspunkt: 'Morgen' }], natFlag: false },
  lure: 'Ja, 30-60 min', vanligOpvaagning: '06:30',
};
const bl = buildPayloadBaseline(blAnswers, { name: 'Baseline Klient' });
check('bl version 1', bl.version === 1);
check('bl categories = [soevn-baseline]', JSON.stringify(bl.categories) === JSON.stringify(['soevn-baseline']));
check('bl baselineType', bl.baselineType === 'soevn-intake');
check('bl exportedAt no-frac', ISO_NOFRAC.test(bl.exportedAt));
check('bl bevarer felter', bl.baseline.alder === 67 && bl.baseline.vanligOpvaagning === '06:30');
check('bl substans struktureret bevaret', bl.baseline.substans && bl.baseline.substans.koffein[0].antalEnheder === 2 && bl.baseline.substans.koffein[0].tidspunkt === 'Morgen');
check('bl substans natFlag bevaret', bl.baseline.substans.natFlag === false);
check('bl INGEN scoring (nul-score)', bl.questionnaireScores === undefined && bl.baseline.score === undefined);
// GDPR-register 1.6 (Viktor 16/7): baseline fra en klient I FORLOEB er BEHANDLINGSDATA.
// Grundlag = art. 9(2)(h) jf. 9(3) + databeskyttelseslovens §7 stk. 3 — IKKE samtykke
// (register 1.3: lav ALDRIG samtykke-checkbox for selve databehandlingen). Oplysningspligten
// (art. 13) opfyldes med en transparens-tekst paa indsamlingstidspunktet (register 1.4).
// => payload er data-minimal: INTET consent-felt, uanset hvad kalderen sender med.
check('bl har INTET consent-felt (register 1.6: 9(2)(h), ikke samtykke)', !('consent' in bl));
const blConsentForsoeg = { accepted: true, timestamp: '2026-07-15T09:00:00Z', version: '2026-07-15' };
const blMedMetaConsent = buildPayloadBaseline(blAnswers, { name: 'Baseline Klient', consent: blConsentForsoeg });
check('bl ignorerer meta.consent (samtykke er ikke retsgrundlag her)', !('consent' in blMedMetaConsent));
const blRT = await nodeDecrypt(await mentemEncrypt(recipientPubB64, bl), recipient.privateKey);
check('bl round-trip baseline bevaret', blRT.baseline.alder === 67 && blRT.baseline.koen === 'Kvinde');
const blRTc = await nodeDecrypt(await mentemEncrypt(recipientPubB64, blMedMetaConsent), recipient.privateKey);
check('bl INTET consent efter decode (Journal Audit ser intet samtykke)', !('consent' in blRTc));

// ── Baseline-oplysningstekst (art. 13) paa welcome-skaermen — statisk kontrakt mod index.html ──
// Erstatter P1-samtykke-blokken. INGEN checkbox, INGEN blokering af Start/send.
console.log('baseline-oplysning (art. 13, register 1.4):');
const INDEX_HTML = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
check('baseline-oplysning-blok findes paa welcome', /id="baseline-oplysning"/.test(INDEX_HTML));
const oplysningBlok = (INDEX_HTML.match(/<div class="diary-oplysning" id="baseline-oplysning">[\s\S]*?<\/div>/) || [''])[0];
check('oplysning linker til privatlivspolitikken', oplysningBlok.includes(PRIVATLIV_URL) && /privatlivspolitik/i.test(oplysningBlok));
check('oplysning siger "din psykolog" (term-lås)', /din psykolog/.test(oplysningBlok));
check('oplysning em-dash-fri', !oplysningBlok.includes('—'));
check('oplysning har INGEN checkbox', !/type="checkbox"/.test(oplysningBlok));
// Samtykke-DOM/-state/-gate er FJERNET fra baseline (kun dagbogen beholder sit consent — separat beslutning).
check('INGEN baseline-samtykke-checkbox tilbage i index.html', !INDEX_HTML.includes('baseline-consent-cb'));
check('INGEN baselineConsentAccepted-gate tilbage i index.html', !INDEX_HTML.includes('baselineConsentAccepted'));
check('INGEN baseline-consent-blok tilbage i index.html', !/id="baseline-consent"/.test(INDEX_HTML));
check('dagbogens consent BEVARES (register 1.7: 9(2)(a) jf. §7 stk. 1 for server-kladden)',
  INDEX_HTML.includes('diary-consent-cb') && INDEX_HTML.includes('consentAccepted()'));

// ── Dagbogen: TO ADSKILTE LAG i samme flade (GDPR-register 1.7, Viktor 16/7) ──────────
// Lag 1 = BEHANDLINGEN: art. 13-oplysningstekst, INGEN checkbox. Grundlaget er journal-
//   føringspligten (9(2)(h) jf. 9(3) + §7 stk. 3), IKKE samtykke — register 1.3 forbyder
//   eksplicit en samtykke-checkbox for selve databehandlingen.
// Lag 2 = SERVER-KLADDEN: den eksisterende samtykke-blok, indrammet så den KUN dækker det
//   fravælgelige bekvemmeligheds-lag (kontinuitet på tværs af enheder) = 9(2)(a).
console.log('dagbog: lag 1 oplysning (art. 13) + lag 2 samtykke (kun server-kladden):');
check('lag 1: dagbog-oplysning-blok findes paa dagbogs-welcome', /id="diary-oplysning"/.test(INDEX_HTML));
const dagbogOpl = (INDEX_HTML.match(/<div class="diary-oplysning" id="diary-oplysning">[\s\S]*?<\/div>/) || [''])[0];
check('lag 1: linker til privatlivspolitikken', dagbogOpl.includes(PRIVATLIV_URL) && /privatlivspolitik/i.test(dagbogOpl));
check('lag 1: siger "din psykolog" (term-lås)', /din psykolog/.test(dagbogOpl));
check('lag 1: INGEN checkbox (behandlingen beror IKKE paa samtykke — register 1.3)',
  dagbogOpl.length > 0 && !/type="checkbox"/.test(dagbogOpl));
check('lag 1: nævner journalfoeringspligten som grundlag (art. 13 stk. 1 litra c)', /journalf/i.test(dagbogOpl));
check('lag 1: em-dash/en-dash-fri', dagbogOpl.length > 0 && !dagbogOpl.includes('—') && !dagbogOpl.includes('–'));
check('lag 1: klienten ser ingen tal/scores', !/\d+\s*(point|score)/i.test(dagbogOpl));

// OPGAVE 3 — em-dash i den LÅSTE §2-tekst (låst 3/6; em-dash-direktivet er fra 19/6 og havde
// aldrig efterset den). index.html er IKKE i EMDASH_GUARDED_FILES (~26 em-dash i shippet copy
// = separat sweep), så denne mål-rettede kontrakt guarder netop samtykke-regionen.
const samtykkeRegion = (INDEX_HTML.match(/function renderDiaryConsent\(\)\s*\{[\s\S]*?\n\}/) || [''])[0];
check('OPGAVE 3: 0 em-dash i dagbogs-samtykket (renderet copy, kommentarer undtaget)',
  samtykkeRegion.length > 0 && scanEmDash(samtykkeRegion, 'index.html#renderDiaryConsent').length === 0,
  scanEmDash(samtykkeRegion, 'x').map(v => v.line).join(','));
check('lag 2: samtykket rammer server-kladden ind (ikke behandlingen)', /kladde/i.test(samtykkeRegion));
// Tilbagetræknings-status er NY klient-facing copy og lever UDEN FOR renderDiaryConsent
// → guard den eksplicit, ellers er den em-dash-fri ved held og ikke ved kontrakt.
const tilbagetraekRegion = (INDEX_HTML.match(/function tilbagetraekningsStatus\(\)\s*\{[\s\S]*?\n\}/) || [''])[0];
check('tilbagetræknings-status: 0 em-dash', tilbagetraekRegion.length > 0 && scanEmDash(tilbagetraekRegion, 'x').length === 0);
check('tilbagetræknings-status siger "din psykolog" (term-lås)', /din psykolog/.test(tilbagetraekRegion));
check('tilbagetræknings-status lover KUN sletning naar DELETE lykkedes (ærligheds-disciplin)',
  /kladdeSletFejl/.test(tilbagetraekRegion) && /kunne ikke/i.test(tilbagetraekRegion));

// ── Forløbs-anmodning (ANMOD v2.1, adaptiv-grundlags-betinget) — kontrakt §1–§3 ───────────
// Maskinel drift-vagt på web-fladen (1:1 m. Swift ForloebsAnmodningKonvolutTests).
console.log('forloebs-anmodning (ANMOD v2.1):');
function throwsCode(name, fn, wantCode) {
  try { fn(); check(name, false, '(forventede kast, fik retur)'); }
  catch (e) { check(name, e.code === wantCode, `(code ${e.code}, want ${wantCode})`); }
}
// Gyldig psykiater-gruppe m. henvisning + tid-objekt (multi-select tilgængelighed)
const anmodGruppe = buildAnmodKonvolut({
  fornavn: 'Syntetisk', efternavn: 'Testperson', grundlag: 'psykiater',
  henvisning_psykiater: 'vestegnsklinikken', forloeb_tilbudt: 'gruppe',
  tid_praeference: { dage: ['tirsdag', 'torsdag'], tider: ['14:00'] },
  atten: true, anmodSamtykke: true, telefon: '12 34 56 78', email: 'test@example.invalid', note: 'Henvist af egen læge',
});
// §3 konvolut-form
check('anmod konvolut schemaVersion = 1 (Int)', anmodGruppe.schemaVersion === 1);
check('anmod konvolut schemaType = forloebs-anmodning', anmodGruppe.schemaType === 'forloebs-anmodning' && anmodGruppe.schemaType === ANMOD_SCHEMA_TYPE);
check('anmod konvolut schemaType ren ASCII', /^[\x00-\x7F]+$/.test(anmodGruppe.schemaType));
check('anmod konvolut clientUA = web', anmodGruppe.clientUA === 'web');
check('anmod konvolut clientTimestamp ISO uden fraktion', ISO_NOFRAC.test(anmodGruppe.clientTimestamp), `(${anmodGruppe.clientTimestamp})`);
check('anmod konvolut bærer INGEN respondentPseudonym web-side', anmodGruppe.respondentPseudonym === undefined);
// §2 data-payload — felt-keys EKSAKT (psykiater gruppe)
const ag = anmodGruppe.data;
eq('anmod data keys (psykiater gruppe)', Object.keys(ag).sort(),
   ['anmodSamtykke','atten','efternavn','email','fornavn','forloeb_tilbudt','grundlag','henvisning_psykiater','note','telefon','tid_praeference','type'].sort());
check('anmod data.type mirror', ag.type === 'forloebs-anmodning');
check('anmod data.fornavn/efternavn', ag.fornavn === 'Syntetisk' && ag.efternavn === 'Testperson');
check('anmod data.grundlag = psykiater', ag.grundlag === 'psykiater');
check('anmod data.henvisning_psykiater wire', ag.henvisning_psykiater === 'vestegnsklinikken');
check('anmod data.forloeb_tilbudt = gruppe (TILBUDT)', ag.forloeb_tilbudt === 'gruppe');
eq('anmod data.tid_praeference objekt (dedup, rækkefølge bevaret)', ag.tid_praeference, { dage:['tirsdag','torsdag'], tider:['14:00'] });
check('anmod data INGEN forloeb_resolved på wire (system-afledt)', ag.forloeb_resolved === undefined);
check('anmod data.atten === true (bool)', ag.atten === true);
check('anmod data.anmodSamtykke === true (bool)', ag.anmodSamtykke === true);
check('anmod data.telefon (PÅKRÆVET, trimmet)', ag.telefon === '12 34 56 78');
check('anmod data.email (valgfri) + note bevaret', ag.email === 'test@example.invalid' && ag.note === 'Henvist af egen læge');
check('anmod data INGEN kombineret kontakt-felt (FJERNET)', ag.kontakt === undefined);
// psykiater-gruppe m. tid "ved_ikke"
const anmodTidVedIkke = buildAnmodKonvolut({ fornavn:'A', efternavn:'B', grundlag:'psykiater', forloeb_tilbudt:'gruppe', tid_praeference:'ved_ikke', atten:true, anmodSamtykke:true, telefon:'12345678' }).data;
check('anmod tid="ved_ikke" bevaret', anmodTidVedIkke.tid_praeference === 'ved_ikke');
// tom-tom multi-select → "ved_ikke" (kanonisk repræsentation)
const anmodTidTom = buildAnmodKonvolut({ fornavn:'A', efternavn:'B', grundlag:'psykiater', forloeb_tilbudt:'gruppe', tid_praeference:{ dage:[], tider:[] }, atten:true, anmodSamtykke:true, telefon:'12345678' }).data;
check('anmod tom-tom tid → "ved_ikke"', anmodTidTom.tid_praeference === 'ved_ikke');
// psykiater-individuelt → ingen tid_praeference
const anmodIndiv = buildAnmodKonvolut({ fornavn:'A', efternavn:'B', grundlag:'psykiater', forloeb_tilbudt:'individuelt', atten:true, anmodSamtykke:true, telefon:'12345678' }).data;
check('anmod psykiater-individuelt: forloeb_tilbudt=individuelt', anmodIndiv.forloeb_tilbudt === 'individuelt');
check('anmod psykiater-individuelt: INGEN tid_praeference', anmodIndiv.tid_praeference === undefined);
// psykiater henvisning valgfri (udeladt passerer)
const anmodUdenHenv = buildAnmodKonvolut({ fornavn:'A', efternavn:'B', grundlag:'psykiater', forloeb_tilbudt:'ved_ikke', atten:true, anmodSamtykke:true, telefon:'12345678' }).data;
check('anmod psykiater henvisning udeladt (valgfri)', anmodUdenHenv.henvisning_psykiater === undefined);
check('anmod psykiater forloeb_tilbudt=ved_ikke', anmodUdenHenv.forloeb_tilbudt === 'ved_ikke');
// forsikring: trim + auto, INGEN psykiater-felter, INGEN forloeb_resolved på wire (afledt Swift-side)
const anmodForsik = buildAnmodKonvolut({ fornavn:'  Anna  ', efternavn:' Sø ', grundlag:'forsikring', atten:true, anmodSamtykke:true, telefon:'  12 34 56 78  ', email:'   ', note:'' }).data;
eq('anmod forsikring data keys (basis + telefon)', Object.keys(anmodForsik).sort(),
   ['anmodSamtykke','atten','efternavn','fornavn','grundlag','telefon','type'].sort());
check('anmod forsikring: INGEN henvisning/forloeb_tilbudt/tid/resolved på wire',
  anmodForsik.henvisning_psykiater === undefined && anmodForsik.forloeb_tilbudt === undefined && anmodForsik.tid_praeference === undefined && anmodForsik.forloeb_resolved === undefined);
check('anmod trimmer fornavn/efternavn', anmodForsik.fornavn === 'Anna' && anmodForsik.efternavn === 'Sø');
check('anmod trimmer telefon (påkrævet)', anmodForsik.telefon === '12 34 56 78');
check('anmod dropper whitespace-email + tom note', anmodForsik.email === undefined && anmodForsik.note === undefined);
// egenbetaler
const anmodEgen = buildAnmodKonvolut({ fornavn:'E', efternavn:'B', grundlag:'egenbetaler', atten:true, anmodSamtykke:true, telefon:'12345678' }).data;
check('anmod egenbetaler: kun basis-felter', anmodEgen.grundlag === 'egenbetaler' && anmodEgen.forloeb_tilbudt === undefined);
// §2 v2.1 validerings-kast (fail-loud, adaptiv kryds-felt)
const VG = { fornavn:'A', efternavn:'B', atten:true, anmodSamtykke:true };
throwsCode('anmod: psykiater UDEN forloeb_tilbudt', () => buildAnmodKonvolut({ ...VG, grundlag:'psykiater' }), 'paakraevet_mangler');
throwsCode('anmod: ugyldig forloeb_tilbudt', () => buildAnmodKonvolut({ ...VG, grundlag:'psykiater', forloeb_tilbudt:'par' }), 'ugyldig_enum');
throwsCode('anmod: v2-værdi "individuel" afvist (v2.1 = individuelt)', () => buildAnmodKonvolut({ ...VG, grundlag:'psykiater', forloeb_tilbudt:'individuel' }), 'ugyldig_enum');
throwsCode('anmod: ugyldig henvisning', () => buildAnmodKonvolut({ ...VG, grundlag:'psykiater', henvisning_psykiater:'ukendt', forloeb_tilbudt:'individuelt' }), 'ugyldig_enum');
throwsCode('anmod: forsikring MED henvisning afvist', () => buildAnmodKonvolut({ ...VG, grundlag:'forsikring', henvisning_psykiater:'vestegnsklinikken' }), 'henvisning_ikke_tilladt');
throwsCode('anmod: forsikring MED forloeb_tilbudt afvist', () => buildAnmodKonvolut({ ...VG, grundlag:'egenbetaler', forloeb_tilbudt:'gruppe' }), 'forloeb_tilbudt_ikke_tilladt');
throwsCode('anmod: forloeb_resolved på wire afvist (system-afledt)', () => buildAnmodKonvolut({ ...VG, grundlag:'forsikring', forloeb_resolved:'individuelt' }), 'forloeb_resolved_ikke_tilladt');
throwsCode('anmod: tid uden gruppe afvist', () => buildAnmodKonvolut({ ...VG, grundlag:'psykiater', forloeb_tilbudt:'individuelt', tid_praeference:'ved_ikke' }), 'tid_praeference_ikke_tilladt');
throwsCode('anmod: tid på forsikring afvist', () => buildAnmodKonvolut({ ...VG, grundlag:'forsikring', tid_praeference:{ dage:['tirsdag'], tider:['14:00'] } }), 'tid_praeference_ikke_tilladt');
throwsCode('anmod: ugyldig tid-streng afvist', () => buildAnmodKonvolut({ ...VG, grundlag:'psykiater', forloeb_tilbudt:'gruppe', tid_praeference:'snart' }), 'ugyldig_tid_praeference');
throwsCode('anmod: ugyldig tid-dag afvist', () => buildAnmodKonvolut({ ...VG, grundlag:'psykiater', forloeb_tilbudt:'gruppe', tid_praeference:{ dage:['mandag'], tider:['14:00'] } }), 'ugyldig_enum');
throwsCode('anmod: ugyldig tid-tid afvist', () => buildAnmodKonvolut({ ...VG, grundlag:'psykiater', forloeb_tilbudt:'gruppe', tid_praeference:{ dage:['tirsdag'], tider:['09:00'] } }), 'ugyldig_enum');
throwsCode('anmod: atten=false afvist', () => buildAnmodKonvolut({ ...VG, grundlag:'egenbetaler', atten:false }), 'atten_paakraevet');
throwsCode('anmod: anmodSamtykke=false afvist (ikke send-tjek)', () => buildAnmodKonvolut({ fornavn:'A', efternavn:'B', grundlag:'egenbetaler', atten:true, anmodSamtykke:false }), 'samtykke_paakraevet');
throwsCode('anmod: manglende fornavn afvist', () => buildAnmodKonvolut({ efternavn:'B', grundlag:'egenbetaler', atten:true, anmodSamtykke:true, telefon:'12345678' }), 'paakraevet_mangler');
// S1 v2.1: telefon PÅKRÆVET (adgangslink via SMS) — manglende/tom => fail-loud telefonPaakraevet
throwsCode('anmod: manglende telefon afvist (PÅKRÆVET)', () => buildAnmodKonvolut({ fornavn:'A', efternavn:'B', grundlag:'egenbetaler', atten:true, anmodSamtykke:true }), 'telefonPaakraevet');
throwsCode('anmod: tom/whitespace telefon afvist', () => buildAnmodKonvolut({ fornavn:'A', efternavn:'B', grundlag:'egenbetaler', atten:true, anmodSamtykke:true, telefon:'   ' }), 'telefonPaakraevet');
throwsCode('anmod: ugyldig grundlag afvist', () => buildAnmodKonvolut({ ...VG, grundlag:'noget-andet' }), 'ugyldig_enum');
throwsCode('anmod: v2-grundlag "vestegnsklinikken" afvist (nu henvisning, ikke grundlag)', () => buildAnmodKonvolut({ ...VG, grundlag:'vestegnsklinikken' }), 'ugyldig_enum');
// §6 art.9-deny (HÅRD) — forbudt helbreds-/CPR-key til stede => hård fejl
for (const denyKey of ['cpr', 'helbred', 'diagnose', 'medicin', 'sygdom', 'symptom', 'health', 'journal']) {
  throwsCode(`anmod: art.9-deny afviser '${denyKey}'`, () => buildAnmodKonvolut({ fornavn:'A', efternavn:'B', grundlag:'egenbetaler', atten:true, anmodSamtykke:true, [denyKey]:'x' }), 'art9Forbudt');
}
check('anmod ART9_DENY dækker kontraktens 9 keys', ANMOD_ART9_DENY.length === 9 && ANMOD_ART9_DENY.includes('diagnosis'));
// v2.1 enums + visningslabels (1:1 m. Swift)
check('anmod v2.1 grundlag enum = [psykiater,forsikring,egenbetaler]', ANMOD_GRUNDLAG.join(',') === 'psykiater,forsikring,egenbetaler');
check('anmod v2.1 henvisning enum', ANMOD_HENVISNING_PSYKIATER.join(',') === 'vestegnsklinikken,westergaard,ved_ikke');
check('anmod v2.1 forloeb_tilbudt enum', ANMOD_FORLOEB_TILBUDT.join(',') === 'gruppe,individuelt,ved_ikke');
check('anmod v2.1 tid dage/tider enums', ANMOD_TID_DAGE.join(',') === 'tirsdag,onsdag,torsdag,fredag' && ANMOD_TID_TIDER.join(',') === '14:00,15:30');
check('anmod v2.1 grundlag-label psykiater = henvist-formulering', /henvist via egen læge/i.test(ANMOD_DISPLAY.grundlag.psykiater));
check('anmod v2.1 henvisning-labels m. personnavn (display-only)', /Andreas Hoff/.test(ANMOD_DISPLAY.henvisning_psykiater.vestegnsklinikken) && /Casper Westergaard/.test(ANMOD_DISPLAY.henvisning_psykiater.westergaard));
// C3 v2.1: forloeb_tilbudt ved_ikke display = "Ved ikke" (forkortet; wire-værdi ved_ikke uændret)
check('anmod C3: forloeb_tilbudt.ved_ikke display = "Ved ikke"', ANMOD_DISPLAY.forloeb_tilbudt.ved_ikke === 'Ved ikke');
// §2b samtykke-ordlyd (wording-version v2-2026-06-19, em-dash-fri) — brand + version + placeholder
check('anmod consent version = v2-2026-06-19', ANMOD_CONSENT_WORDING_VERSION === 'v2-2026-06-19');
check('anmod consent brand = Psykolog Viktor Nielsen', ANMOD_CONSENT_WORDING.includes('Psykolog Viktor Nielsen'));
check('anmod consent siger ALDRIG Mycel', !/Mycel/i.test(ANMOD_CONSENT_WORDING));
check('anmod consent har [privatlivspolitikken]-placeholder', ANMOD_CONSENT_WORDING.includes('[privatlivspolitikken]'));
check('anmod consent nævner tilbagetrækning (art.9(2)(a)-rettighed)', /trække .* tilbage/.test(ANMOD_CONSENT_WORDING));
check('anmod consent em-dash-fri (C4/§2b v2)', !ANMOD_CONSENT_WORDING.includes('—'));
// round-trip: anmod-konvolut krypteres + dekrypteres → data intakt (zero-knowledge)
const anmodRT = await nodeDecrypt(await mentemEncrypt(recipientPubB64, anmodGruppe), recipient.privateKey);
check('anmod round-trip schemaType', anmodRT.schemaType === 'forloebs-anmodning');
check('anmod round-trip clientUA = web', anmodRT.clientUA === 'web');
eq('anmod round-trip data.tid_praeference', anmodRT.data.tid_praeference, { dage:['tirsdag','torsdag'], tider:['14:00'] });

// ── VERA-guard #1: emoji/glyf-detektor (regressions-lås) ───────────────────
// Unit-tests af scanText() (deterministisk — uafhængig af repo-tilstand) + en
// run mod de FAKTISKE klient-facing filer (fanger en ægte regression i CI).
// ── K3+K4: samlet send-kvittering + "Send sikkert"-CTA (besked-track FASE B) ──
// V-6 (Viktor 15/7): én fælles primær kvittering overalt; de 2 flow-specifikke
// kliniske forsikringer bevares som sekundær linje kun på deres flow.
// Term (Viktor 15/7): "din psykolog" (surface-konsistent). Klient ser ALDRIG tal.
console.log('K3+K4 send-kvittering (FASE B):');
check('primær kvittering = én fælles streng (din psykolog)',
  SENDT_KVITTERING_PRIMAER === 'Dine svar er sendt sikkert og krypteret til din psykolog. Tak!');
check('primær kvittering nævner ingen tal (klient ser aldrig tal)', !/[0-9]/.test(SENDT_KVITTERING_PRIMAER));
check('primær kvittering bruger "psykolog", ikke "behandler"',
  SENDT_KVITTERING_PRIMAER.includes('psykolog') && !SENDT_KVITTERING_PRIMAER.includes('behandler'));
eq('screening beholder flow-forsikring som sekundær (V-6)',
  sendtKvitteringSekundaer('soevn-screening'), 'Du kan roligt gå i gang med din søvndagbog med det samme.');
eq('dagbog-opdatering beholder flow-forsikring som sekundær (V-6)',
  sendtKvitteringSekundaer('soevndagbog-opdatering'), 'Du kan roligt fortsætte dagbogen.');
eq('batteri har ingen sekundær linje', sendtKvitteringSekundaer('batteri'), null);
eq('dagbog-send (terminal) har ingen sekundær linje', sendtKvitteringSekundaer('soevndagbog'), null);
eq('baseline har ingen sekundær linje', sendtKvitteringSekundaer('soevn-baseline'), null);
eq('ukendt flow → ingen sekundær linje (fail-safe)', sendtKvitteringSekundaer('ukendt'), null);
check('K4 primær CTA = "Send sikkert"', SEND_SIKKERT_CTA === 'Send sikkert');
check('kvittering-copy versions-stemplet', SENDT_KVITTERING_VERSION === '2026-07-15');

console.log('emoji-guard (VERA #1):');
const G = (t) => scanText(t, 't').length;
// catch: emoji-som-ikon i renderet flade
check('guard fanger 🔒 i HTML-tekst', G('<button>Gem 🔒</button>') === 1);
check('guard fanger ✓ (U+2713) i label', G('<span>✓Intet</span>') === 1);
check('guard fanger 🌙/🔎/🔊/✅', G('<i>🌙</i><i>🔎</i><i>🔊</i><i>✅</i>') === 1);
check('guard fanger emoji i JS-strengliteral', G("el.textContent = 'Færdig 🎉';") === 1);
// pass: typografi + kommentarer renderer ikke / er ikke ikoner
check('guard tillader typografisk pil →', G('<button>Færdig →</button>') === 0);
check('guard ignorerer emoji i // linje-kommentar', G('const x = 1; // note 🔒 her') === 0);
check('guard ignorerer emoji i /* blok */-kommentar', G('a;/* tag ✅ */b;') === 0);
check('guard ignorerer emoji i <!-- HTML-kommentar -->', G('x<!-- 🔒 -->y') === 0);
check('guard fejl-stripper IKKE https:// (URL bevares)', G("a='see http://x 🔒';") === 1);
// allowlist: bevidst-beholdt prosa med eksplicit markør
check('guard respekterer emoji-guard:allow-markør', G('<p>Tillykke 🎉</p> <!-- emoji-guard:allow: fejring -->') === 0);
check('guard fanger stadig UDEN markør', G('<p>Tillykke 🎉</p>') === 1);
// real-file run (c9fcaab skal være ren)
const liveViolations = runGuard();
check(`guard GRØN mod live ${GUARDED_FILES.join('+')} (0 regressioner)`, liveViolations.length === 0,
  liveViolations.map(v => `${v.file}:${v.line} ${v.glyphs.join(' ')}`).join(' | '));

// ── VERA-guard: em-dash-detektor (Viktor-direktiv 2026-06-19, analog til emoji-guard) ──
console.log('emdash-guard (forbudt-tegn "—"):');
const D = (t) => scanEmDash(t, 't').length;
check('emdash-guard fanger "—" i HTML-tekst', D('<p>Tekst — mere</p>') === 1);
check('emdash-guard fanger "—" i JS-strengliteral', D("el.textContent = 'A — B';") === 1);
check('emdash-guard tillader bindestreg "-"', D('<p>14:00-15:30</p>') === 0);
check('emdash-guard tillader midterprik "·"', D('<p>A · B</p>') === 0);
check('emdash-guard tillader box-streg "─"', D('<p>──────</p>') === 0);
check('emdash-guard ignorerer "—" i // linje-kommentar', D('const x = 1; // note — her') === 0);
check('emdash-guard ignorerer "—" i /* blok */-kommentar', D('a;/* tag — her */b;') === 0);
check('emdash-guard ignorerer "—" i <!-- HTML-kommentar -->', D('x<!-- — -->y') === 0);
check('emdash-guard respekterer emdash-guard:allow-markør', D('<p>A — B</p> <!-- emdash-guard:allow: bevidst -->') === 0);
// Instrument-region: verbatim-instrumenter (GAD-7/PHQ-9/WHO-5/WSAS) undtaget; vores egen copy stadig guardet.
check('emdash-guard ekskluderer instrument-region (verbatim instrument)',
  D('a — b\n// emdash-guard:instrument-start\nx — y\n// emdash-guard:instrument-end\nc — d') === 2);
check('emdash-guard guardet IGEN efter instrument-region-end',
  D('// emdash-guard:instrument-start\nx — y\n// emdash-guard:instrument-end\negen — copy') === 1);
const liveEmDash = runEmDashGuard();
check(`emdash-guard GRØN mod live ${EMDASH_GUARDED_FILES.join('+')} (0 em-dash i renderet copy)`, liveEmDash.length === 0,
  liveEmDash.map(v => `${v.file}:${v.line}`).join(' | '));

// ── VERA-guard #2: synlig-copy-guard (em-dash + en-dash + anglicistisk bindestreg) ──
// Født 16/7: Viktor fangede SELV samme sprogfejl 3 gange på én dag ("engangs-skema",
// "søvn-svar") — anglicistisk bindestreg, som Iowan Old Style tegner så lang at den ligner
// em-dash. Ubevogtet indtil nu. Scanner SYNLIG copy (ikke rå bytes), hvilket er præcis det
// der endelig gør index.html guardbar: den bærer 69 em-dash i KOMMENTARER (0 i synlig copy),
// så en rå-scan ville være rød uden en eneste ægte fejl. Fuld test: node test/copy-guard-test.mjs
console.log('copy-guard (VERA #2 — synlig klient-copy):');
const C = (t) => scanCopy(t, 't.html').length;
check('copy-guard fanger "engangs-skema" (Viktor 16/7)', C('<p>et engangs-skema</p>') === 1);
check('copy-guard fanger "søvn-svar" i JS-streng (Viktor 16/7)', C('<script>x.textContent = "dine søvn-svar";</script>') === 1);
check('copy-guard fanger em-dash i synlig copy', C('<p>A — B</p>') === 1);
check('copy-guard fanger en-dash som tankestreg', C('<p>A – B</p>') === 1);
check('copy-guard tillader "GAD-7"/"uge 1-3" (forkortelse/talinterval)', C('<p>GAD-7 i uge 1-3</p>') === 0);
check('copy-guard tillader talinterval med en-dash "0–100 %"', C('<p>(0–100 %)</p>') === 0);
check('copy-guard ignorerer kommentarer (rå-byte-fælden)', C('<!-- engangs-skema — her -->') === 0);
check('copy-guard ignorerer CSS-selektor/className', C('<script>el.className = "diary-field nrs-field";</script>') === 0);
const liveCopy = triageCopy(runCopyGuard());
check(`copy-guard GRØN mod live ${COPY_GUARDED_FILES.join('+')} (0 NYE sprog-regressioner)`, liveCopy.nye.length === 0,
  liveCopy.nye.map(v => `${v.file}:${v.line} "${v.found}"`).join(' | '));
check('copy-guard: 0 stale poster i PENDING_VIKTOR_GO (listen skal krympe, ikke rådne)',
  liveCopy.stale.length === 0, liveCopy.stale.map(p => p.found).join(' | '));
if (liveCopy.pendingFundet) {
  console.log(`  i ${liveCopy.pendingFundet} KENDTE nudansk-fund i shippet copy afventer Viktor-GO (PENDING_VIKTOR_GO i test/copy-guard.mjs)`);
}

console.log('');
if (failures > 0) { console.error(`SELFTEST FAILED: ${failures} fejl`); process.exit(1); }
console.log('SELFTEST PASSED ✅');
