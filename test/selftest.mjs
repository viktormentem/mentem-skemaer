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
} from '../mentem-skema-core.js';

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

console.log('buildPayload:');
const payload = buildPayload(answers, { name: 'Test Klient', sessionNumber: 4 });
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

const container = await mentemEncrypt(recipientPubB64, payload);
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
check('round-trip clientName', roundtripped.clientName === payload.clientName);
check('round-trip qs bevaret', roundtripped.questionnaireScores.length === 5);
check('round-trip casTrends bevaret', roundtripped.casTrends[0].componentScores.worry === 80);

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
for (const k of ['bedtime','lightsOut','sleepLatencyMin','awakeningsCount','awakeningsMin','finalAwake','outOfBed','quality','naps','medication']) {
  check(`CSD-felt: ${k}`, diaryKeys.includes(k));
}

console.log('buildPayloadCSD:');
const csdEntries = [
  { date:'2026-06-01', bedtime:'23:15', lightsOut:'23:30', sleepLatencyMin:25, awakeningsCount:2, awakeningsMin:30, finalAwake:'06:45', outOfBed:'07:00', quality:3, naps:'', medication:'' },
  { date:'2026-06-02', bedtime:'23:00', lightsOut:'23:20', sleepLatencyMin:15, awakeningsCount:1, awakeningsMin:10, finalAwake:'06:30', outOfBed:'06:50', quality:4, naps:'20 min ved middag', medication:'1 glas vin kl. 20' },
];
const csd = buildPayloadCSD(csdEntries, { name:'Søvn Klient', startedAt:'2026-06-01', plannedDays:14 });
check('csd version 1', csd.version === 1);
check('csd therapistName', csd.therapistName === 'Viktor Nielsen');
check('csd clientName', csd.clientName === 'Søvn Klient');
check('csd categories = [soevndagbog]', JSON.stringify(csd.categories) === JSON.stringify(['soevndagbog']));
check('csd diaryType', csd.diaryType === 'consensus-sleep-diary');
check('csd plannedDays', csd.plannedDays === 14);
check('csd exportedAt no-frac', ISO_NOFRAC.test(csd.exportedAt), `(${csd.exportedAt})`);
check('csd sleepDiary 2 entries', csd.sleepDiary.length === 2);
check('csd entry bevarer felter', csd.sleepDiary[0].bedtime === '23:15' && csd.sleepDiary[0].sleepLatencyMin === 25);
check('csd dropper tomme valgfri felter', csd.sleepDiary[0].naps === undefined && csd.sleepDiary[0].medication === undefined);
check('csd beholder udfyldte valgfri felter', csd.sleepDiary[1].naps === '20 min ved middag');
check('csd INGEN scoring (nul-score)', csd.questionnaireScores === undefined && csd.sleepDiary[0].tst === undefined && csd.sleepDiary[0].se === undefined);

// Round-trip: CSD-payload krypteres + dekrypteres → sleepDiary intakt.
const csdContainer = await mentemEncrypt(recipientPubB64, csd);
const csdRT = await nodeDecrypt(csdContainer, recipient.privateKey);
check('csd round-trip sleepDiary bevaret', csdRT.sleepDiary.length === 2 && csdRT.sleepDiary[1].quality === 4);
check('csd round-trip diaryType bevaret', csdRT.diaryType === 'consensus-sleep-diary');

// Versions-blok (§6) + forloebId.
console.log('csd versions-blok (draft-store):');
const csdV = buildPayloadCSD(csdEntries, { startedAt: '2026-06-01', plannedDays: 14, forloebId: 'a1b2c3d4e5f60718293a4b5c6d7e8f90' });
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
for (const k of ['alder','koen','undertype','varighed','sovemedicin','stimulanser','lure','vanligOpvaagning']) {
  check(`baseline-felt: ${k}`, blKeys.includes(k));
}
check('baseline INGEN alder i daglig CSD', !CSD_SOEVNDAGBOG.fields.some(f => f.key === 'alder'));

console.log('buildPayloadBaseline:');
const blAnswers = {
  alder: 67, koen: 'Kvinde', undertype: 'Vågner for tidligt om morgenen',
  varighed: '3 måneder eller mere', sovemedicin: '', stimulanser: '2 kopper kaffe',
  lure: 'Ja, 30-60 min', vanligOpvaagning: '06:30',
};
const bl = buildPayloadBaseline(blAnswers, { name: 'Baseline Klient' });
check('bl version 1', bl.version === 1);
check('bl categories = [soevn-baseline]', JSON.stringify(bl.categories) === JSON.stringify(['soevn-baseline']));
check('bl baselineType', bl.baselineType === 'soevn-intake');
check('bl exportedAt no-frac', ISO_NOFRAC.test(bl.exportedAt));
check('bl bevarer felter', bl.baseline.alder === 67 && bl.baseline.vanligOpvaagning === '06:30');
check('bl dropper tomme valgfri', bl.baseline.sovemedicin === undefined);
check('bl beholder udfyldte valgfri', bl.baseline.stimulanser === '2 kopper kaffe');
check('bl INGEN scoring (nul-score)', bl.questionnaireScores === undefined && bl.baseline.score === undefined);
const blRT = await nodeDecrypt(await mentemEncrypt(recipientPubB64, bl), recipient.privateKey);
check('bl round-trip baseline bevaret', blRT.baseline.alder === 67 && blRT.baseline.koen === 'Kvinde');

console.log('');
if (failures > 0) { console.error(`SELFTEST FAILED: ${failures} fejl`); process.exit(1); }
console.log('SELFTEST PASSED ✅');
