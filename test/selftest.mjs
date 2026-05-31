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
  mentemEncrypt,
  SKEMA_ORDER,
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

console.log('');
if (failures > 0) { console.error(`SELFTEST FAILED: ${failures} fejl`); process.exit(1); }
console.log('SELFTEST PASSED ✅');
